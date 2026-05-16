/**
 * Cliente de Anthropic + helpers para invocar al decision agent con prompt
 * caching activado.
 *
 * Mandamos al modelo TRES bloques separados:
 *   1. system → personaje + principios + casos fundacionales (cached, ephemeral)
 *   2. system → perfil de la familia (cached, ephemeral)
 *   3. user → contexto del momento (fresh, no cached)
 *
 * El plan de visión asume cache hit ≥ 70% (NANNY-VISION §12.2). Cada bloque
 * que pongas como `cache_control: { type: 'ephemeral' }` cuenta como un
 * "breakpoint" — Anthropic permite hasta 4. Usamos solo 2 (system+profile)
 * que cubren el ~95% de los tokens estables.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  DECISION_AGENT_SYSTEM_PROMPT,
} from './system-prompt';
import type { DecisionAgentOutput } from '@/lib/types';

export const DECISION_AGENT_MODEL = 'claude-sonnet-4-6';

// Precios USD por 1M tokens — Claude Sonnet 4.6 (mayo 2026).
// Fuente: anthropic.com/pricing.
const PRICE_PER_MTOK = {
  input: 3.00,
  cache_write: 3.75, // 25% premium sobre input
  cache_read: 0.30,  // 10% del input
  output: 15.00,
};

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ClaudeResult {
  raw: Anthropic.Messages.Message;
  text: string;
  usage: ClaudeUsage;
  cost_usd: number;
  latency_ms: number;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no está configurada.');
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface InvokeDecisionAgentInput {
  familyProfileText: string;
  momentContextText: string;
  // Override opcional para tests / replay
  maxTokens?: number;
  temperature?: number;
}

/**
 * Invoca al decision agent con prompt caching y parsea el JSON de salida.
 * Si el modelo no devuelve JSON parseable, devuelve una intervención
 * silenciosa con `reason` explicando el error.
 */
export async function invokeDecisionAgent(
  input: InvokeDecisionAgentInput,
): Promise<{ output: DecisionAgentOutput; raw: ClaudeResult }> {
  const start = Date.now();
  const client = getClient();

  const message = await client.messages.create({
    model: DECISION_AGENT_MODEL,
    max_tokens: input.maxTokens ?? 700,
    temperature: input.temperature ?? 0.3,
    system: [
      {
        type: 'text',
        text: DECISION_AGENT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: input.familyProfileText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: input.momentContextText
          + '\n\nDevuelve EXCLUSIVAMENTE el JSON de decisión, sin texto adicional ni markdown.',
      },
    ],
  });

  const latency_ms = Date.now() - start;

  const text = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const usage: ClaudeUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };

  const cost_usd = computeCost(usage);

  const output = parseDecisionOutput(text);

  return {
    output,
    raw: { raw: message, text, usage, cost_usd, latency_ms },
  };
}

/**
 * Intenta parsear el JSON del modelo. Si falla, devuelve silencio (intervene=false)
 * con `reason` describiendo el problema. NUNCA tira excepción — preferimos
 * un silencio respetuoso a romper el cron.
 */
export function parseDecisionOutput(raw: string): DecisionAgentOutput {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeOutput(parsed);
  } catch (err) {
    // Fallback: buscar el primer { y el último } para extraer JSON embebido.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const candidate = cleaned.slice(start, end + 1);
        const parsed = JSON.parse(candidate);
        return normalizeOutput(parsed);
      } catch {
        // fallthrough
      }
    }
    return {
      intervene: false,
      message: null,
      delivery: null,
      delivery_target_contact_id: null,
      priority: null,
      reason: `parse_error: no se pudo extraer JSON del modelo (${(err as Error).message})`,
      captured_preference: null,
      captured_learning_item: null,
    };
  }
}

function stripFences(s: string): string {
  let out = s.trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  }
  return out;
}

function normalizeOutput(p: unknown): DecisionAgentOutput {
  const obj = (p ?? {}) as Record<string, unknown>;
  const intervene = obj.intervene === true;
  const messageRaw = typeof obj.message === 'string' ? obj.message.trim() : '';
  const message = intervene && messageRaw.length > 0 ? messageRaw : null;
  const deliveryRaw = typeof obj.delivery === 'string' ? obj.delivery : null;
  const delivery =
    intervene && (deliveryRaw === 'chat' || deliveryRaw === 'whatsapp_contact' || deliveryRaw === 'push')
      ? deliveryRaw
      : null;
  const priorityRaw = typeof obj.priority === 'string' ? obj.priority : null;
  const priority =
    intervene && (priorityRaw === 'low' || priorityRaw === 'medium' || priorityRaw === 'high')
      ? priorityRaw
      : null;
  const contactId = typeof obj.delivery_target_contact_id === 'string' && obj.delivery_target_contact_id.length > 0
    ? obj.delivery_target_contact_id
    : null;
  const reason = typeof obj.reason === 'string' && obj.reason.trim().length > 0
    ? obj.reason.trim()
    : (intervene ? 'sin razón explícita' : 'silencio sin razón explícita');

  const captured_preference = normalizePreference(obj.captured_preference);
  const captured_learning_item = normalizeLearningItem(obj.captured_learning_item);

  // Coherencia mínima: si intervene=true pero no hay message ni delivery,
  // bajamos a intervene=false con reason explicativo (pero conservamos las
  // capturas — pueden ser válidas aunque la intervención sea inválida).
  if (intervene && (!message || !delivery)) {
    return {
      intervene: false,
      message: null,
      delivery: null,
      delivery_target_contact_id: null,
      priority: null,
      reason: `coercion: intervene=true pero ${!message ? 'message' : 'delivery'} faltante. original_reason=${reason}`,
      captured_preference,
      captured_learning_item,
    };
  }
  return {
    intervene,
    message,
    delivery,
    delivery_target_contact_id: contactId,
    priority,
    reason,
    captured_preference,
    captured_learning_item,
  };
}

const PREFERENCE_TYPES = new Set([
  'topic_avoid', 'time_window', 'name_alias',
  'notification_preference', 'parent_role_assignment', 'other',
]);
const PREFERENCE_SOURCES = new Set(['explicit', 'correction', 'inferred']);
const URGENCIES = new Set(['low', 'medium', 'high']);

function normalizePreference(p: unknown): DecisionAgentOutput['captured_preference'] {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const typeStr = typeof o.preference_type === 'string' ? o.preference_type : '';
  const contentStr = typeof o.content === 'string' ? o.content.trim() : '';
  const sourceStr = typeof o.source === 'string' ? o.source : '';
  if (!PREFERENCE_TYPES.has(typeStr)) return null;
  if (contentStr.length === 0) return null;
  if (!PREFERENCE_SOURCES.has(sourceStr)) return null;
  return {
    preference_type: typeStr as DecisionAgentOutput['captured_preference'] extends infer T
      ? T extends { preference_type: infer P } ? P : never : never,
    content: contentStr,
    applies_to_child_id: typeof o.applies_to_child_id === 'string' && o.applies_to_child_id.length > 0
      ? o.applies_to_child_id : null,
    applies_to_parent_id: typeof o.applies_to_parent_id === 'string' && o.applies_to_parent_id.length > 0
      ? o.applies_to_parent_id : null,
    source: sourceStr as DecisionAgentOutput['captured_preference'] extends infer T
      ? T extends { source: infer S } ? S : never : never,
  };
}

function normalizeLearningItem(p: unknown): DecisionAgentOutput['captured_learning_item'] {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const topic = typeof o.topic === 'string' ? o.topic.trim() : '';
  const urgency = typeof o.urgency === 'string' ? o.urgency : '';
  if (topic.length === 0) return null;
  if (!URGENCIES.has(urgency)) return null;
  return {
    topic,
    urgency: urgency as DecisionAgentOutput['captured_learning_item'] extends infer T
      ? T extends { urgency: infer U } ? U : never : never,
    question_text: typeof o.question_text === 'string' && o.question_text.trim().length > 0
      ? o.question_text.trim() : null,
    context_required: (o.context_required && typeof o.context_required === 'object')
      ? o.context_required as Record<string, unknown>
      : {},
  };
}

function computeCost(u: ClaudeUsage): number {
  const inMtok = u.input_tokens / 1_000_000;
  const cacheWriteMtok = u.cache_creation_input_tokens / 1_000_000;
  const cacheReadMtok = u.cache_read_input_tokens / 1_000_000;
  const outMtok = u.output_tokens / 1_000_000;
  const total =
    inMtok * PRICE_PER_MTOK.input +
    cacheWriteMtok * PRICE_PER_MTOK.cache_write +
    cacheReadMtok * PRICE_PER_MTOK.cache_read +
    outMtok * PRICE_PER_MTOK.output;
  return Math.round(total * 1_000_000) / 1_000_000; // 6 decimales
}
