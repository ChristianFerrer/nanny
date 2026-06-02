/**
 * Listening Pipeline — Sprint 3.
 *
 * Captura silenciosa de items estructurables (eventos, tareas, medicación,
 * rutinas) desde un mensaje del padre. NO genera reply textual: eso es
 * responsabilidad del decision agent. NO toma decisiones: solo extrae y
 * persiste cuando hay datos suficientes.
 *
 * Filosofía (NANNY-VISION §4 — "escuchar antes que hablar"):
 *   - Ante la duda, NO capturar. El decision agent puede pedir lo que falte.
 *   - Una llamada a Claude Haiku 4.5 con tool use (la opción más barata y
 *     rápida del tier, ~$0.001/msg, ~1s).
 *   - Prompt caching: system + tools como cache breakpoint estable; el
 *     mensaje + contexto familiar como input fresh.
 *
 * Integración: `/api/chat/route.ts` lo invoca ANTES del decision agent
 * cuando la familia está en USE_NEW_PIPELINE_FAMILY_IDS. El decision
 * agent ve los items recién creados en su contexto de agenda 48h.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';

export const LISTENER_MODEL = 'claude-haiku-4-5';

// Precios USD/1M tokens — Claude Haiku 4.5 (mayo 2026).
const PRICE_PER_MTOK = {
  input: 1.00,
  cache_write: 1.25, // 25% premium
  cache_read: 0.10,  // 10%
  output: 5.00,
};

export interface ListenerInput {
  familyId: string;
  message: string;
  senderRole: 'mama' | 'papa';
  senderName: string;
  messageId: string | null;
  // Fecha actual para resolver "mañana", "el viernes", etc.
  now?: Date;
}

export interface ListenerCapturedItem {
  type: 'event' | 'task' | 'medication' | 'routine';
  id: string;
  title: string;
}

export interface ListenerResult {
  items_captured: number;
  items: ListenerCapturedItem[];
  cost_usd: number;
  latency_ms: number;
  tool_call_count: number;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no está configurada.');
  _client = new Anthropic({ apiKey });
  return _client;
}

// ────────────────────────────────────────────────────────────
// System prompt + tools (estables → cache breakpoint)
// ────────────────────────────────────────────────────────────

const LISTENER_SYSTEM_PROMPT = `Sos el componente de CAPTURA SILENCIOSA de Nanny.

Tu única tarea: si el mensaje del padre contiene un evento concreto, tarea, medicación o rutina semanal, llamá la tool correspondiente con los datos extraídos. Si no hay nada estructurable o falta info crítica, NO llames ninguna tool.

REGLA DE ORO — ANTE LA DUDA, SILENCIO. Otro componente (el decision agent) decide si vale la pena pedir info faltante al padre. Vos NO. Vos solo capturás lo que está claro.

Datos críticos por tool (si faltan → no la llames):
- create_event: title, event_type, date_start (ISO con hora, no solo fecha)
- create_task: title (status="pending" por defecto)
- create_medication: medication_name, frequency (o schedule_times)
- create_routine: child_name, name, days_of_week, time_start

Reglas de assigned_to (para events y tasks):
- "yo lo hago", "me encargo", "lo llevo yo" → assigned_to del padre que escribe
- "lo lleva mi pareja/marido/esposa/mujer" → assigned_to del otro padre
- Si no se menciona explícitamente, omití assigned_to

Fechas: convertí "mañana", "el viernes", "en 2 semanas" a ISO 8601 usando la fecha actual que se te pasa en el contexto. Para eventos sin hora explícita usá defaults: médico 10:00, escolar 08:00, actividad tarde 16:00.

Rutinas vs eventos: si describe horario fijo y recurrente ("Pau tiene guardería de lunes a viernes de 9 a 17"), eso es create_routine, NO create_event. Si es un día puntual ("Pau tiene pediatra el viernes 10h"), eso es create_event.

Múltiples items en un mensaje: llamá varias tools en paralelo. Ej. "el viernes pediatra de Pau a las 10 y comprar pañales" → create_event + create_task.

NO inventes datos. NO completes campos con "Por confirmar". Si falta, no llames la tool.`;

const LISTENER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'create_event',
    description: 'Crear un evento puntual con fecha y hora (cita médica, excursión escolar, cumpleaños, actividad de un día). NO usar para horarios fijos recurrentes — eso es create_routine.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto. Ej: "Cita pediatra", "Excursión Pau".' },
        event_type: {
          type: 'string',
          enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'],
        },
        date_start: {
          type: 'string',
          description: 'ISO 8601 con hora (YYYY-MM-DDTHH:mm:ss). Si no se mencionó hora usá default por tipo (doctor 10:00, school 08:00, activity 16:00).',
        },
        date_end: { type: 'string', description: 'ISO 8601, opcional.' },
        location: { type: 'string', description: 'Lugar si se mencionó.' },
        child_name: { type: 'string', description: 'Nombre del hijo. Tiene que matchear EXACTAMENTE uno de los hijos del contexto familiar.' },
        assigned_to: { type: 'string', enum: ['mama', 'papa'], description: 'Padre responsable si se mencionó.' },
      },
      required: ['title', 'event_type', 'date_start'],
    },
  },
  {
    name: 'create_task',
    description: 'Crear tarea, compra o pago pendiente. Default status="pending". Solo creá "done" si el mensaje reporta algo ya hecho.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Ej: "Comprar pañales", "Pagar excursión".' },
        status: { type: 'string', enum: ['pending', 'done'], description: 'Default pending.' },
        due_date: { type: 'string', description: 'ISO 8601 si se mencionó fecha límite.' },
        assigned_to: { type: 'string', enum: ['mama', 'papa'] },
        child_name: { type: 'string', description: 'Hijo al que aplica si corresponde.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_medication',
    description: 'Registrar tratamiento médico con dosis, frecuencia y duración. Solo si el mensaje describe medicación con horarios concretos.',
    input_schema: {
      type: 'object',
      properties: {
        medication_name: { type: 'string' },
        child_name: { type: 'string', description: 'Hijo al que aplica.' },
        frequency: { type: 'string', description: 'Ej: "cada 8 horas", "3 veces al día".' },
        schedule_times: {
          type: 'array',
          items: { type: 'string' },
          description: 'Horarios HH:MM. Ej: ["08:00","16:00","00:00"].',
        },
        duration_days: { type: 'number' },
        start_date: { type: 'string', description: 'ISO 8601 (date).' },
        end_date: { type: 'string', description: 'ISO 8601 (date). Calcula start + duration_days.' },
      },
      required: ['medication_name'],
    },
  },
  {
    name: 'create_routine',
    description: 'Crear RUTINA SEMANAL (horario fijo recurrente: guardería, cole, fútbol semanal). NO usar para eventos puntuales.',
    input_schema: {
      type: 'object',
      properties: {
        child_name: { type: 'string', description: 'Hijo al que pertenece la rutina.' },
        name: { type: 'string', description: 'Ej: "Guardería", "Fútbol", "Cole".' },
        type: {
          type: 'string',
          enum: ['school', 'activity', 'meal', 'morning', 'afternoon', 'night', 'custom'],
        },
        days_of_week: {
          type: 'array',
          items: { type: 'integer', minimum: 0, maximum: 6 },
          description: '0=dom, 1=lun..6=sáb. Ej: [1,2,3,4,5] = L-V.',
        },
        time_start: { type: 'string', description: 'HH:MM 24h.' },
        time_end: { type: 'string', description: 'HH:MM 24h. Si "9 a 4:30" asumí PM: 09:00–16:30.' },
      },
      required: ['child_name', 'name', 'type', 'days_of_week', 'time_start'],
    },
  },
];

// ────────────────────────────────────────────────────────────
// Orquestador
// ────────────────────────────────────────────────────────────

export async function runListener(input: ListenerInput): Promise<ListenerResult> {
  const start = Date.now();
  const now = input.now ?? new Date();

  const admin = getSupabaseAdmin();

  // Cargamos hijos + parents para mapear nombres → ids.
  const [{ data: children }, { data: parents }] = await Promise.all([
    admin.from('children').select('id, name').eq('family_id', input.familyId),
    admin.from('parents').select('id, role').eq('family_id', input.familyId),
  ]);

  const childrenList = (children || []) as { id: string; name: string }[];
  const parentsList = (parents || []) as { id: string; role: 'mama' | 'papa' }[];

  const childByName = new Map<string, string>();
  for (const c of childrenList) childByName.set(c.name.toLowerCase().trim(), c.id);

  const parentByRole = new Map<'mama' | 'papa', string>();
  for (const p of parentsList) parentByRole.set(p.role, p.id);

  const todayIso = now.toISOString();
  const childrenContext = childrenList.length > 0
    ? `Hijos de la familia: ${childrenList.map(c => c.name).join(', ')}.`
    : 'La familia no tiene hijos cargados todavía.';

  const userPayload = [
    `Fecha y hora actual: ${todayIso}`,
    childrenContext,
    `Mensaje del padre (${input.senderName}, rol ${input.senderRole}):`,
    `"${input.message.trim()}"`,
  ].join('\n');

  // ──── Invocar Haiku con tool use ────
  const client = getClient();
  let message: Anthropic.Messages.Message;
  try {
    message = await client.messages.create({
      model: LISTENER_MODEL,
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: LISTENER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: LISTENER_TOOLS,
      messages: [{ role: 'user', content: userPayload }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[listener] anthropic error', { familyId: input.familyId, error: msg });
    return {
      items_captured: 0,
      items: [],
      cost_usd: 0,
      latency_ms: Date.now() - start,
      tool_call_count: 0,
    };
  }

  const toolUses = message.content.filter(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
  );

  const usage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };
  const cost_usd = computeCost(usage);

  if (toolUses.length === 0) {
    console.log('[listener] no capture', {
      familyId: input.familyId,
      messageId: input.messageId,
      latency_ms: Date.now() - start,
      cost_usd,
    });
    return {
      items_captured: 0,
      items: [],
      cost_usd,
      latency_ms: Date.now() - start,
      tool_call_count: 0,
    };
  }

  // ──── Persistir cada tool call ────
  const items: ListenerCapturedItem[] = [];
  for (const block of toolUses) {
    try {
      const item = await persistToolCall({
        familyId: input.familyId,
        senderId: parentByRole.get(input.senderRole) ?? null,
        block,
        childByName,
        parentByRole,
      });
      if (item) items.push(item);
    } catch (err) {
      console.error('[listener] persist error', {
        familyId: input.familyId,
        tool: block.name,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  const latency_ms = Date.now() - start;
  console.log('[listener] capture', {
    familyId: input.familyId,
    messageId: input.messageId,
    items_captured: items.length,
    tool_calls: toolUses.length,
    latency_ms,
    cost_usd,
  });

  return {
    items_captured: items.length,
    items,
    cost_usd,
    latency_ms,
    tool_call_count: toolUses.length,
  };
}

// ────────────────────────────────────────────────────────────
// Persistencia por tool
// ────────────────────────────────────────────────────────────

async function persistToolCall(args: {
  familyId: string;
  senderId: string | null;
  block: Anthropic.Messages.ToolUseBlock;
  childByName: Map<string, string>;
  parentByRole: Map<'mama' | 'papa', string>;
}): Promise<ListenerCapturedItem | null> {
  const { familyId, senderId, block, childByName, parentByRole } = args;
  const admin = getSupabaseAdmin();
  const input = block.input as Record<string, unknown>;

  const childName = typeof input.child_name === 'string' ? input.child_name.trim() : '';
  const childId = childName ? (childByName.get(childName.toLowerCase()) ?? null) : null;

  const assignedRole = typeof input.assigned_to === 'string'
    ? (input.assigned_to.toLowerCase() as 'mama' | 'papa')
    : null;
  const assignedToId = assignedRole && (assignedRole === 'mama' || assignedRole === 'papa')
    ? (parentByRole.get(assignedRole) ?? null)
    : null;

  if (block.name === 'create_event') {
    const title = strField(input.title);
    const dateStart = strField(input.date_start);
    if (!title || !dateStart) return null;

    const { data, error } = await admin
      .from('events')
      .insert({
        family_id: familyId,
        child_id: childId,
        title,
        description: null,
        event_type: strField(input.event_type) || 'other',
        date_start: dateStart,
        date_end: strField(input.date_end) || null,
        location: strField(input.location) || null,
        status: 'pending',
        source: 'listener',
        auto_detected: true,
        created_by: senderId,
        ...(assignedToId ? { assigned_to: assignedToId } : {}),
      })
      .select('id, title')
      .single();

    if (error || !data) {
      console.error('[listener] event insert error', error);
      return null;
    }
    return { type: 'event', id: data.id, title: data.title };
  }

  if (block.name === 'create_task') {
    const title = strField(input.title);
    if (!title) return null;
    const status = (input.status === 'done' ? 'done' : 'pending') as 'pending' | 'done';

    const { data, error } = await admin
      .from('tasks')
      .insert({
        family_id: familyId,
        child_id: childId,
        parent_task_id: null,
        title,
        description: null,
        assigned_to: assignedToId,
        due_date: strField(input.due_date) || null,
        status,
        priority: 'normal',
        source: 'listener',
        auto_detected: true,
        created_by: senderId,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      })
      .select('id, title')
      .single();

    if (error || !data) {
      console.error('[listener] task insert error', error);
      return null;
    }
    return { type: 'task', id: data.id, title: data.title };
  }

  if (block.name === 'create_medication') {
    const medName = strField(input.medication_name);
    if (!medName) return null;

    const scheduleTimes = Array.isArray(input.schedule_times)
      ? input.schedule_times.filter((t): t is string => typeof t === 'string')
      : [];

    const { data, error } = await admin
      .from('medications')
      .insert({
        family_id: familyId,
        child_id: childId,
        child_name: childName || '',
        medication_name: medName,
        duration_days: typeof input.duration_days === 'number' ? input.duration_days : null,
        start_date: strField(input.start_date) || new Date().toISOString().split('T')[0],
        end_date: strField(input.end_date) || null,
        frequency: strField(input.frequency) || null,
        schedule_times: scheduleTimes,
        status: 'active',
        source: 'listener',
        auto_detected: true,
        created_by: senderId,
      })
      .select('id, medication_name')
      .single();

    if (error || !data) {
      console.error('[listener] medication insert error', error);
      return null;
    }
    return { type: 'medication', id: data.id, title: data.medication_name };
  }

  if (block.name === 'create_routine') {
    const routineName = strField(input.name);
    const daysRaw = input.days_of_week;
    const timeStart = strField(input.time_start);
    if (!routineName || !childId || !timeStart) return null;

    const days = Array.isArray(daysRaw)
      ? daysRaw.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
      : [];
    if (days.length === 0) return null;

    const { data, error } = await admin
      .from('routines')
      .insert({
        child_id: childId,
        type: strField(input.type) || 'custom',
        name: routineName,
        description: null,
        days_of_week: days,
        time_start: timeStart,
        time_end: strField(input.time_end) || null,
        active: true,
      })
      .select('id, name')
      .single();

    if (error || !data) {
      console.error('[listener] routine insert error', error);
      return null;
    }
    return { type: 'routine', id: data.id, title: data.name };
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function computeCost(u: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}): number {
  const inMtok = u.input_tokens / 1_000_000;
  const cacheWriteMtok = u.cache_creation_input_tokens / 1_000_000;
  const cacheReadMtok = u.cache_read_input_tokens / 1_000_000;
  const outMtok = u.output_tokens / 1_000_000;
  const total =
    inMtok * PRICE_PER_MTOK.input +
    cacheWriteMtok * PRICE_PER_MTOK.cache_write +
    cacheReadMtok * PRICE_PER_MTOK.cache_read +
    outMtok * PRICE_PER_MTOK.output;
  return Math.round(total * 1_000_000) / 1_000_000;
}
