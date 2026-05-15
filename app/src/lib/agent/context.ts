/**
 * Armado de contexto para el decision agent.
 *
 * Devuelve dos bloques separados que se mandan a Claude:
 *   - familyProfile: estable, cacheable (parents, children, support contacts).
 *   - momentContext: efímero, fresh cada turno (agenda 48h, mensajes 24h,
 *     patrones, preferencias, learning queue, estado emocional).
 *
 * Ver NANNY-VISION.md §6.3 ("Inputs del decision agent").
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import type {
  Child,
  FamilyEvent,
  FamilyPattern,
  FamilyPreference,
  LearningQueueItem,
  Medication,
  Message,
  Parent,
  SupportContact,
  Task,
} from '@/lib/types';

export interface FamilyProfileBlock {
  family_id: string;
  family_name: string;
  timezone: string;
  parents: Pick<Parent, 'id' | 'name' | 'role'>[];
  children: Pick<Child, 'id' | 'name' | 'birth_date' | 'allergies' | 'medical_notes' | 'personality_notes'>[];
  support_contacts: Pick<SupportContact, 'id' | 'name' | 'relationship' | 'consent_status'>[];
}

export interface MomentContextBlock {
  // Cuándo y por qué se invocó al decision agent
  trigger: {
    type: 'scheduled' | 'message' | 'manual';
    moment: 'morning' | 'midday' | 'afternoon' | 'evening' | null;
    local_time_iso: string; // ISO con offset de la familia
    local_day_label: string; // "miércoles 15 de mayo de 2026"
    triggering_message_id: string | null;
    triggering_message_preview: string | null;
  };
  // Agenda 48h adelante
  upcoming_events: Pick<FamilyEvent, 'id' | 'title' | 'date_start' | 'date_end' | 'location' | 'assigned_to' | 'child_id' | 'status'>[];
  pending_tasks: Pick<Task, 'id' | 'title' | 'due_date' | 'assigned_to' | 'priority' | 'child_id' | 'status'>[];
  active_medications: Pick<Medication, 'id' | 'medication_name' | 'child_name' | 'schedule_times' | 'frequency' | 'end_date'>[];
  // Conversación últimas 24h
  recent_messages: { sender: string; role: 'parent' | 'nanny'; text: string; at: string }[];
  // Memoria semántica (Sprint 2)
  patterns: Pick<FamilyPattern, 'pattern_type' | 'description' | 'confidence'>[];
  preferences: Pick<FamilyPreference, 'preference_type' | 'content' | 'source'>[];
  learning_queue: Pick<LearningQueueItem, 'topic' | 'urgency' | 'question_text' | 'context_required'>[];
  // Memoria emocional efímera (NANNY-VISION §5.4) — placeholder hasta Sprint 3
  emotional_signal_last_48h: string | null;
}

export interface BuiltContext {
  profile: FamilyProfileBlock;
  moment: MomentContextBlock;
  // Resumen de tamaños para log de auditoría sin guardar el texto entero
  summary: {
    parents: number;
    children: number;
    support_contacts: number;
    upcoming_events: number;
    pending_tasks: number;
    active_medications: number;
    recent_messages: number;
    patterns: number;
    preferences: number;
    learning_queue: number;
  };
}

export interface BuildContextInput {
  familyId: string;
  trigger: MomentContextBlock['trigger'];
}

export async function buildDecisionContext(input: BuildContextInput): Promise<BuiltContext | null> {
  const admin = getSupabaseAdmin();

  const { data: family } = await admin
    .from('families')
    .select('id, name, timezone')
    .eq('id', input.familyId)
    .maybeSingle();

  if (!family) return null;

  const tz: string = family.timezone || 'UTC';

  const now = new Date();
  const horizonMs = 48 * 60 * 60 * 1000;
  const past24hMs = 24 * 60 * 60 * 1000;
  const horizonIso = new Date(now.getTime() + horizonMs).toISOString();
  const past24hIso = new Date(now.getTime() - past24hMs).toISOString();
  const past48hIso = new Date(now.getTime() - 2 * past24hMs).toISOString();

  const [
    parentsRes,
    childrenRes,
    contactsRes,
    eventsRes,
    tasksRes,
    medsRes,
    messagesRes,
    patternsRes,
    preferencesRes,
    queueRes,
  ] = await Promise.all([
    admin.from('parents').select('id, name, role').eq('family_id', input.familyId),
    admin.from('children')
      .select('id, name, birth_date, allergies, medical_notes, personality_notes')
      .eq('family_id', input.familyId),
    admin.from('support_contacts')
      .select('id, name, relationship, consent_status')
      .eq('family_id', input.familyId)
      .eq('active', true),
    admin.from('events')
      .select('id, title, date_start, date_end, location, assigned_to, child_id, status')
      .eq('family_id', input.familyId)
      .gte('date_start', now.toISOString())
      .lte('date_start', horizonIso)
      .neq('status', 'cancelled')
      .order('date_start', { ascending: true }),
    admin.from('tasks')
      .select('id, title, due_date, assigned_to, priority, child_id, status')
      .eq('family_id', input.familyId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    admin.from('medications')
      .select('id, medication_name, child_name, schedule_times, frequency, end_date')
      .eq('family_id', input.familyId)
      .eq('status', 'active'),
    admin.from('messages')
      .select('id, sender_id, sender_type, content, created_at')
      .eq('family_id', input.familyId)
      .gte('created_at', past24hIso)
      .order('created_at', { ascending: true })
      .limit(40),
    admin.from('family_patterns')
      .select('pattern_type, description, confidence')
      .eq('family_id', input.familyId)
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .limit(20),
    admin.from('family_preferences')
      .select('preference_type, content, source')
      .eq('family_id', input.familyId)
      .eq('active', true)
      .limit(20),
    admin.from('family_learning_queue')
      .select('topic, urgency, question_text, context_required')
      .eq('family_id', input.familyId)
      .eq('status', 'pending')
      .order('urgency', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5),
  ]);

  const parents = (parentsRes.data || []) as FamilyProfileBlock['parents'];
  const parentsById = new Map(parents.map(p => [p.id, p]));

  const messages = (messagesRes.data || []) as Pick<Message, 'id' | 'sender_id' | 'sender_type' | 'content' | 'created_at'>[];
  const recentMessages: MomentContextBlock['recent_messages'] = messages.map(m => ({
    sender: m.sender_type === 'nanny' ? 'Nanny' : (parentsById.get(m.sender_id || '')?.name || 'Padre'),
    role: m.sender_type as 'parent' | 'nanny',
    text: m.content,
    at: m.created_at,
  }));

  // Memoria emocional efímera (placeholder Sprint 1):
  // Hasta que el listening pipeline (Sprint 3) marque mensajes con flag emocional,
  // buscamos heurísticamente desahogos en mensajes de las últimas 48h. Es lo
  // mínimo para que el decision agent ajuste el tono cuando hay señal.
  const emotionalKeywords = [
    'no doy más',
    'no puedo más',
    'agotad',
    'cansad',
    'infierno',
    'colapsad',
    'me supera',
    'no aguanto',
  ];
  const { data: emotionalMsgs } = await admin
    .from('messages')
    .select('content, created_at')
    .eq('family_id', input.familyId)
    .eq('sender_type', 'parent')
    .gte('created_at', past48hIso)
    .order('created_at', { ascending: false })
    .limit(50);
  const emotionalSignal = (emotionalMsgs || []).find(m =>
    emotionalKeywords.some(k => (m.content || '').toLowerCase().includes(k))
  );

  let triggerMessagePreview: string | null = null;
  if (input.trigger.triggering_message_id) {
    const found = messages.find(m => m.id === input.trigger.triggering_message_id);
    if (found) triggerMessagePreview = found.content;
  }

  const moment: MomentContextBlock = {
    trigger: {
      ...input.trigger,
      triggering_message_preview: triggerMessagePreview,
    },
    upcoming_events: (eventsRes.data || []) as MomentContextBlock['upcoming_events'],
    pending_tasks: (tasksRes.data || []) as MomentContextBlock['pending_tasks'],
    active_medications: (medsRes.data || []) as MomentContextBlock['active_medications'],
    recent_messages: recentMessages,
    patterns: (patternsRes.data || []) as MomentContextBlock['patterns'],
    preferences: (preferencesRes.data || []) as MomentContextBlock['preferences'],
    learning_queue: (queueRes.data || []) as MomentContextBlock['learning_queue'],
    emotional_signal_last_48h: emotionalSignal
      ? `${emotionalSignal.created_at}: "${emotionalSignal.content.slice(0, 120)}"`
      : null,
  };

  const profile: FamilyProfileBlock = {
    family_id: family.id,
    family_name: family.name || 'Familia',
    timezone: tz,
    parents,
    children: (childrenRes.data || []) as FamilyProfileBlock['children'],
    support_contacts: (contactsRes.data || []) as FamilyProfileBlock['support_contacts'],
  };

  return {
    profile,
    moment,
    summary: {
      parents: profile.parents.length,
      children: profile.children.length,
      support_contacts: profile.support_contacts.length,
      upcoming_events: moment.upcoming_events.length,
      pending_tasks: moment.pending_tasks.length,
      active_medications: moment.active_medications.length,
      recent_messages: moment.recent_messages.length,
      patterns: moment.patterns.length,
      preferences: moment.preferences.length,
      learning_queue: moment.learning_queue.length,
    },
  };
}

/**
 * Renderiza el perfil familiar como bloque de texto cacheable. NO incluye
 * datos efímeros (agenda, mensajes) — esos van en el user message.
 *
 * Mantenido como markdown plano para que sea legible en logs y diffeable
 * cuando cambia. El orden importa para el cache de Claude: cualquier
 * reordenamiento invalida el cache.
 */
export function renderFamilyProfile(p: FamilyProfileBlock): string {
  const lines: string[] = [];
  lines.push(`# Perfil familiar — ${p.family_name}`);
  lines.push(`Timezone: ${p.timezone}`);
  lines.push('');
  lines.push('## Padres');
  for (const parent of p.parents) {
    lines.push(`- ${parent.name} (${parent.role}) — id: ${parent.id}`);
  }
  lines.push('');
  lines.push('## Hijos');
  if (p.children.length === 0) {
    lines.push('- (sin hijos registrados)');
  } else {
    for (const c of p.children) {
      const parts: string[] = [`- ${c.name}`];
      if (c.birth_date) parts.push(`(nacido ${c.birth_date})`);
      if (c.allergies && c.allergies.length > 0) parts.push(`alergias: ${c.allergies.join(', ')}`);
      if (c.medical_notes) parts.push(`médico: ${c.medical_notes}`);
      if (c.personality_notes) parts.push(`personalidad: ${c.personality_notes}`);
      lines.push(parts.join(' — '));
    }
  }
  lines.push('');
  lines.push('## Red de apoyo (consentimiento explícito requerido para WhatsApp)');
  if (p.support_contacts.length === 0) {
    lines.push('- (sin contactos cargados)');
  } else {
    for (const sc of p.support_contacts) {
      lines.push(`- ${sc.name} (${sc.relationship}) — consent: ${sc.consent_status} — id: ${sc.id}`);
    }
  }
  return lines.join('\n');
}

/**
 * Renderiza el contexto del momento como texto. Cambia turno a turno —
 * NO va cacheado.
 */
export function renderMomentContext(m: MomentContextBlock): string {
  const lines: string[] = [];
  lines.push('# Contexto del momento');
  lines.push(`Trigger: ${m.trigger.type}${m.trigger.moment ? ` (${m.trigger.moment})` : ''}`);
  lines.push(`Hora local: ${m.trigger.local_time_iso} (${m.trigger.local_day_label})`);
  if (m.trigger.triggering_message_id) {
    lines.push(`Mensaje gatillo: "${m.trigger.triggering_message_preview ?? '(no encontrado)'}"`);
  }
  lines.push('');

  lines.push('## Agenda próximas 48h');
  if (m.upcoming_events.length === 0) {
    lines.push('(sin eventos agendados)');
  } else {
    for (const e of m.upcoming_events) {
      const assignee = e.assigned_to ? ` — ${e.assigned_to}` : '';
      const loc = e.location ? ` @ ${e.location}` : '';
      lines.push(`- ${e.date_start} · ${e.title}${assignee}${loc}`);
    }
  }
  lines.push('');

  lines.push('## Tareas pendientes');
  if (m.pending_tasks.length === 0) {
    lines.push('(ninguna)');
  } else {
    for (const t of m.pending_tasks) {
      const due = t.due_date ? ` (due ${t.due_date})` : '';
      const who = t.assigned_to ? ` — ${t.assigned_to}` : '';
      lines.push(`- [${t.priority}] ${t.title}${due}${who}`);
    }
  }
  lines.push('');

  lines.push('## Medicación activa');
  if (m.active_medications.length === 0) {
    lines.push('(ninguna)');
  } else {
    for (const med of m.active_medications) {
      const times = (med.schedule_times || []).join(', ');
      lines.push(`- ${med.medication_name} (${med.child_name}) — ${med.frequency || times || 'sin horario'}${med.end_date ? ` hasta ${med.end_date}` : ''}`);
    }
  }
  lines.push('');

  lines.push('## Conversación últimas 24h');
  if (m.recent_messages.length === 0) {
    lines.push('(sin mensajes recientes)');
  } else {
    for (const msg of m.recent_messages) {
      lines.push(`[${msg.at}] ${msg.sender}: ${msg.text}`);
    }
  }
  lines.push('');

  lines.push('## Patrones aprendidos (memoria semántica, confidence ≥ 0.5)');
  if (m.patterns.length === 0) {
    lines.push('(todavía no aprendí patrones — esta familia es nueva o Sprint 2 aún no extrajo)');
  } else {
    for (const pat of m.patterns) {
      lines.push(`- [${pat.confidence.toFixed(2)}] ${pat.pattern_type}: ${pat.description}`);
    }
  }
  lines.push('');

  lines.push('## Preferencias y sensibilidades explícitas');
  if (m.preferences.length === 0) {
    lines.push('(ninguna)');
  } else {
    for (const pref of m.preferences) {
      lines.push(`- (${pref.source}) ${pref.preference_type}: ${pref.content}`);
    }
  }
  lines.push('');

  lines.push('## Learning queue (cosas pendientes que querés aprender)');
  if (m.learning_queue.length === 0) {
    lines.push('(vacía)');
  } else {
    for (const q of m.learning_queue) {
      lines.push(`- [${q.urgency}] ${q.topic}${q.question_text ? ` — "${q.question_text}"` : ''}`);
    }
    lines.push('');
    lines.push('REGLA: máximo UNA pregunta de learning queue por día. Solo preguntá si el contexto actual lo hace natural.');
  }
  lines.push('');

  lines.push('## Estado emocional efímero (últimas 48h)');
  if (m.emotional_signal_last_48h) {
    lines.push(`SEÑAL DETECTADA: ${m.emotional_signal_last_48h}`);
    lines.push('Ajustá tono: alivianás carga, no proponés tareas extra, priorizás silencio donde dudes. NUNCA verbalices la señal.');
  } else {
    lines.push('(sin señal)');
  }

  return lines.join('\n');
}

/**
 * Etiqueta legible para humanos. Usada en el log y en el `local_day_label`
 * que va al modelo.
 */
export function formatDayLabel(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * ISO con offset de la zona horaria de la familia. Usado para que el modelo
 * sepa exactamente la hora local sin que tenga que adivinar el offset.
 */
export function formatLocalIso(d: Date, tz: string): string {
  try {
    // Construir manualmente "YYYY-MM-DDTHH:mm:ss" en la TZ y luego pegar el offset.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    let hour = get('hour');
    if (hour === '24') hour = '00';
    const time = `${hour}:${get('minute')}:${get('second')}`;
    const offset = tzOffsetIso(d, tz);
    return `${date}T${time}${offset}`;
  } catch {
    return d.toISOString();
  }
}

function tzOffsetIso(d: Date, tz: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(d);
    const name = parts.find(p => p.type === 'timeZoneName')?.value || '';
    // longOffset returns "GMT+02:00" or "GMT-03:00"
    const m = name.match(/GMT([+-]\d{1,2}):?(\d{2})?/);
    if (!m) return 'Z';
    const sign = m[1].startsWith('-') ? '-' : '+';
    const hh = m[1].replace(/[+-]/, '').padStart(2, '0');
    const mm = (m[2] || '00').padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  } catch {
    return 'Z';
  }
}
