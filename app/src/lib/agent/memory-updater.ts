/**
 * Memory Updater — Sprint 2.
 *
 * Corre 1x por día por familia. Arma un contexto de actividad de las
 * últimas 24h + patrones actuales + perfil familiar; invoca Claude con
 * prompt caching; aplica las operaciones propuestas sobre family_patterns
 * y family_learning_queue.
 *
 * Es ASÍNCRONO al chat: nada de lo que decide se le muestra al usuario.
 *
 * Ver NANNY-VISION.md §5 (memoria semántica) y AGENT-REWRITE-PLAN.md §4.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { DECISION_AGENT_MODEL } from './claude';
import { renderFamilyProfile, buildDecisionContext } from './context';
import { MEMORY_UPDATER_SYSTEM_PROMPT } from './memory-system-prompt';

const PRICE_PER_MTOK = {
  input: 3.0,
  cache_write: 3.75,
  cache_read: 0.3,
  output: 15.0,
};

// Decay automático: si un patrón no se confirma en estos días, decay propuesto.
const DECAY_AFTER_DAYS = 14;

export interface MemoryUpdaterResult {
  family_id: string;
  operations_applied: number;
  patterns_created: number;
  patterns_confirmed: number;
  patterns_contradicted: number;
  patterns_decayed: number;
  learning_items_enqueued: number;
  cost_usd: number;
  latency_ms: number;
  summary: string | null;
  error?: string;
}

export async function runMemoryUpdaterForFamily(familyId: string): Promise<MemoryUpdaterResult | null> {
  const start = Date.now();
  const admin = getSupabaseAdmin();

  // Reusamos buildDecisionContext para perfil. Para la "actividad 24h"
  // hacemos un query dedicado más amplio (no limitado a 40 mensajes).
  const ctx = await buildDecisionContext({
    familyId,
    trigger: {
      type: 'manual',
      moment: null,
      local_time_iso: new Date().toISOString(),
      local_day_label: '',
      triggering_message_id: null,
      triggering_message_preview: null,
    },
  });
  if (!ctx) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [messagesRes, eventsRes, tasksRes, patternsRes] = await Promise.all([
    admin
      .from('messages')
      .select('id, sender_id, sender_type, content, created_at, metadata')
      .eq('family_id', familyId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    admin
      .from('events')
      .select('id, title, date_start, assigned_to, child_id, created_at, source')
      .eq('family_id', familyId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    admin
      .from('tasks')
      .select('id, title, assigned_to, status, child_id, created_at, source')
      .eq('family_id', familyId)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    // TODOS los patrones existentes (no filtrados por confidence) — necesitamos
    // pasarle al modelo también los que están debajo de 0.5 para que pueda
    // proponer subir/bajar/decay.
    admin
      .from('family_patterns')
      .select('id, pattern_type, description, confidence, last_observed_at, updated_at')
      .eq('family_id', familyId)
      .order('confidence', { ascending: false }),
  ]);

  const messages = messagesRes.data || [];
  const events = eventsRes.data || [];
  const tasks = tasksRes.data || [];
  const patterns = (patternsRes.data || []) as Array<{
    id: string;
    pattern_type: string;
    description: string;
    confidence: number;
    last_observed_at: string;
    updated_at: string;
  }>;

  // Si no hay actividad nueva ni patrones para revisar, salir temprano.
  if (messages.length === 0 && events.length === 0 && tasks.length === 0 && patterns.length === 0) {
    return {
      family_id: familyId,
      operations_applied: 0,
      patterns_created: 0,
      patterns_confirmed: 0,
      patterns_contradicted: 0,
      patterns_decayed: 0,
      learning_items_enqueued: 0,
      cost_usd: 0,
      latency_ms: Date.now() - start,
      summary: 'sin actividad 24h y sin patrones a evaluar',
    };
  }

  const parentsById = new Map(ctx.profile.parents.map(p => [p.id, p]));
  const activityText = renderActivity({ messages, events, tasks, parentsById });
  const patternsText = renderExistingPatterns(patterns);
  const profileText = renderFamilyProfile(ctx.profile);

  // ─────── Invocar Claude ───────
  let raw: Anthropic.Messages.Message;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    raw = await client.messages.create({
      model: DECISION_AGENT_MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      system: [
        { type: 'text', text: MEMORY_UPDATER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: profileText, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content:
            `Hora actual UTC: ${new Date().toISOString()}\n\n` +
            patternsText + '\n\n' + activityText +
            '\n\nDevuelve EXCLUSIVAMENTE el JSON con operations[] y summary, sin texto adicional ni markdown.',
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[memory-updater] anthropic error', { familyId, error: msg });
    return {
      family_id: familyId,
      operations_applied: 0,
      patterns_created: 0,
      patterns_confirmed: 0,
      patterns_contradicted: 0,
      patterns_decayed: 0,
      learning_items_enqueued: 0,
      cost_usd: 0,
      latency_ms: Date.now() - start,
      summary: null,
      error: msg,
    };
  }

  const text = raw.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const usage = raw.usage;
  const cost_usd =
    (usage.input_tokens / 1_000_000) * PRICE_PER_MTOK.input +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * PRICE_PER_MTOK.cache_write +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * PRICE_PER_MTOK.cache_read +
    (usage.output_tokens / 1_000_000) * PRICE_PER_MTOK.output;

  const parsed = parseOperations(text);
  if (!parsed) {
    console.warn('[memory-updater] parse error', { familyId, text_preview: text.slice(0, 300) });
    return {
      family_id: familyId,
      operations_applied: 0,
      patterns_created: 0,
      patterns_confirmed: 0,
      patterns_contradicted: 0,
      patterns_decayed: 0,
      learning_items_enqueued: 0,
      cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
      latency_ms: Date.now() - start,
      summary: null,
      error: 'parse_error',
    };
  }

  // ─────── Aplicar operaciones ───────
  const counts = {
    created: 0,
    confirmed: 0,
    contradicted: 0,
    decayed: 0,
    enqueued: 0,
  };
  const patternsById = new Map(patterns.map(p => [p.id, p]));

  for (const op of parsed.operations) {
    try {
      if (op.op === 'create_pattern') {
        const conf = clamp(op.confidence ?? 0.3, 0.0, 0.6); // create siempre con confidence baja
        const { error } = await admin.from('family_patterns').insert({
          family_id: familyId,
          pattern_type: op.pattern_type,
          description: op.description,
          confidence: conf,
          source_message_ids: op.source_message_ids ?? [],
        });
        if (!error) counts.created++;
      } else if (op.op === 'confirm_pattern' && op.pattern_id) {
        const existing = patternsById.get(op.pattern_id);
        if (!existing) continue;
        const delta = clamp(op.delta ?? 0.1, 0.0, 0.15);
        const newConf = clamp(existing.confidence + delta, 0.0, 1.0);
        await admin.from('family_patterns')
          .update({
            confidence: newConf,
            last_observed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', op.pattern_id);
        counts.confirmed++;
      } else if (op.op === 'contradict_pattern' && op.pattern_id) {
        const existing = patternsById.get(op.pattern_id);
        if (!existing) continue;
        const delta = clamp(op.delta ?? -0.2, -0.3, 0.0);
        const newConf = clamp(existing.confidence + delta, 0.0, 1.0);
        await admin.from('family_patterns')
          .update({ confidence: newConf, updated_at: new Date().toISOString() })
          .eq('id', op.pattern_id);
        counts.contradicted++;
      } else if (op.op === 'decay_pattern' && op.pattern_id) {
        const existing = patternsById.get(op.pattern_id);
        if (!existing) continue;
        // Sanity: solo aceptamos decay de patrones genuinamente viejos.
        const ageDays = (Date.now() - new Date(existing.last_observed_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < DECAY_AFTER_DAYS) continue;
        const delta = clamp(op.delta ?? -0.1, -0.15, 0.0);
        const newConf = clamp(existing.confidence + delta, 0.0, 1.0);
        await admin.from('family_patterns')
          .update({ confidence: newConf, updated_at: new Date().toISOString() })
          .eq('id', op.pattern_id);
        counts.decayed++;
      } else if (op.op === 'enqueue_learning' && op.topic) {
        // Dedup por topic pendiente
        const { data: existing } = await admin
          .from('family_learning_queue')
          .select('id')
          .eq('family_id', familyId)
          .eq('topic', op.topic)
          .eq('status', 'pending')
          .limit(1)
          .maybeSingle();
        if (existing) continue;
        await admin.from('family_learning_queue').insert({
          family_id: familyId,
          topic: op.topic,
          urgency: op.urgency ?? 'low',
          question_text: op.question_text ?? null,
          context_required: op.context_required ?? {},
          status: 'pending',
        });
        counts.enqueued++;
      }
    } catch (err) {
      console.warn('[memory-updater] op error', { op, err });
    }
  }

  return {
    family_id: familyId,
    operations_applied: counts.created + counts.confirmed + counts.contradicted + counts.decayed + counts.enqueued,
    patterns_created: counts.created,
    patterns_confirmed: counts.confirmed,
    patterns_contradicted: counts.contradicted,
    patterns_decayed: counts.decayed,
    learning_items_enqueued: counts.enqueued,
    cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
    latency_ms: Date.now() - start,
    summary: parsed.summary,
  };
}

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

interface ParsedOps {
  operations: ParsedOperation[];
  summary: string | null;
}

type ParsedOperation =
  | { op: 'create_pattern'; pattern_type: string; description: string; confidence?: number; source_message_ids?: string[] }
  | { op: 'confirm_pattern'; pattern_id: string; delta?: number }
  | { op: 'contradict_pattern'; pattern_id: string; delta?: number }
  | { op: 'decay_pattern'; pattern_id: string; delta?: number }
  | { op: 'enqueue_learning'; topic: string; urgency?: 'low' | 'medium' | 'high'; question_text?: string | null; context_required?: Record<string, unknown> };

function parseOperations(raw: string): ParsedOps | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const obj = parsed as Record<string, unknown>;
  const opsRaw = Array.isArray(obj.operations) ? obj.operations : [];
  const operations = opsRaw.filter(isValidOp) as ParsedOperation[];
  const summary = typeof obj.summary === 'string' ? obj.summary : null;
  return { operations, summary };
}

function isValidOp(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const op = (o as Record<string, unknown>).op;
  if (op === 'create_pattern') {
    const x = o as Record<string, unknown>;
    return typeof x.pattern_type === 'string' && typeof x.description === 'string' && x.description.length > 5;
  }
  if (op === 'confirm_pattern' || op === 'contradict_pattern' || op === 'decay_pattern') {
    return typeof (o as Record<string, unknown>).pattern_id === 'string';
  }
  if (op === 'enqueue_learning') {
    return typeof (o as Record<string, unknown>).topic === 'string';
  }
  return false;
}

interface MessageRow {
  id: string;
  sender_id: string | null;
  sender_type: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}
interface EventRow { id: string; title: string; date_start: string; assigned_to: string | null; child_id: string | null; created_at: string; source: string }
interface TaskRow { id: string; title: string; assigned_to: string | null; status: string; child_id: string | null; created_at: string; source: string }

function renderActivity(args: {
  messages: MessageRow[];
  events: EventRow[];
  tasks: TaskRow[];
  parentsById: Map<string, { id: string; name: string; role: string }>;
}): string {
  const lines: string[] = ['# Actividad últimas 24h'];

  lines.push('\n## Mensajes del chat');
  if (args.messages.length === 0) {
    lines.push('(sin mensajes)');
  } else {
    for (const m of args.messages) {
      const sender = m.sender_type === 'nanny' ? 'Nanny' : (args.parentsById.get(m.sender_id || '')?.name || 'Padre');
      lines.push(`[${m.created_at}] ${sender}: ${m.content}`);
    }
  }

  lines.push('\n## Eventos creados');
  if (args.events.length === 0) {
    lines.push('(sin eventos nuevos)');
  } else {
    for (const e of args.events) {
      const who = e.assigned_to ? ` — assigned_to=${e.assigned_to}` : '';
      lines.push(`- ${e.date_start} · ${e.title}${who} (source=${e.source})`);
    }
  }

  lines.push('\n## Tareas creadas');
  if (args.tasks.length === 0) {
    lines.push('(sin tareas nuevas)');
  } else {
    for (const t of args.tasks) {
      const who = t.assigned_to ? ` — assigned_to=${t.assigned_to}` : '';
      lines.push(`- ${t.title} (status=${t.status})${who} (source=${t.source})`);
    }
  }

  return lines.join('\n');
}

function renderExistingPatterns(patterns: Array<{
  id: string;
  pattern_type: string;
  description: string;
  confidence: number;
  last_observed_at: string;
}>): string {
  if (patterns.length === 0) return '# Patrones actuales\n(ninguno — la familia es nueva, o todavía no aprendimos nada)';
  const lines = ['# Patrones actuales (con id para que puedas confirmar/contradecir/decay)'];
  for (const p of patterns) {
    lines.push(`- id=${p.id} [${p.confidence.toFixed(2)}] (${p.pattern_type}) last_observed=${p.last_observed_at}: ${p.description}`);
  }
  return lines.join('\n');
}
