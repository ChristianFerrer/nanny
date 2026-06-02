/**
 * Nanny Assistant — el cerebro único.
 *
 * UNA llamada a Claude por mensaje. Lee la conversación reciente como un
 * todo (no mensaje por mensaje), tiene 4 herramientas para anotar, y
 * responde como una asistente personal: corta, concreta, útil.
 *
 * Reemplaza al pipeline orquestado (classifier/extractor/responder +
 * listener + decision agent). Sin clasificar, sin decidir en pasos
 * separados, sin regex de safety. Confiamos en la inteligencia del modelo
 * con el contexto correcto.
 *
 * Filosofía: que lea como una persona y asista. Nada más.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';

export const ASSISTANT_MODEL = 'claude-sonnet-4-6';

// Precios USD/1M tokens — Claude Sonnet 4.6 (mayo 2026).
const PRICE_PER_MTOK = {
  input: 3.00,
  cache_write: 3.75,
  cache_read: 0.30,
  output: 15.00,
};

// Cuántos mensajes recientes del chat ve Nanny como contexto. Suficiente
// para entender una ráfaga ("mañana cumple / 15 niños / comprar fruta /
// bocaditos") sin inflar tokens.
const CONVERSATION_WINDOW = 20;

export interface AssistantInput {
  familyId: string;
  senderRole: 'mama' | 'papa';
  senderName: string;
  now?: Date;
}

export interface AssistantCapturedItem {
  type: 'event' | 'task' | 'medication' | 'routine';
  id: string;
  title: string;
  action?: 'create' | 'complete' | 'cancel' | 'edit';
}

export interface AssistantResult {
  reply: string | null;
  items: AssistantCapturedItem[];
  cost_usd: number;
  latency_ms: number;
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
// System prompt — corto. Confiamos en la inteligencia, no en reglas.
// ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos Nanny, la asistente personal de una familia. En este chat conversan mamá y papá; vos los ayudás como lo haría una asistente atenta y discreta.

Cómo trabajás:
- Leé la conversación reciente COMO UN TODO. Los padres escriben en ráfagas de mensajes cortos: "mañana cumple de Pau" / "vienen 15 niños" / "hay que comprar fruta" / "y bocaditos" son UN solo pensamiento. Entendé el conjunto, no cada mensaje aislado.
- Cuando aparezca algo que conviene tener registrado —una cita o evento, una tarea o compra, un tratamiento, una rutina semanal— anotalo con tus herramientas. No pidas permiso para lo obvio.
- Después de anotar, confirmá en UNA línea natural y concreta. Ej: "Anotado: cumple de Pau mañana. En la lista: fruta y bocaditos para los papás."
- Si te hacen una pregunta o piden algo, respondé directo y útil.
- Si es charla sin nada que hacer (un saludo, un "gracias"), respondé breve y cálido. Si de verdad no aportás nada, podés no responder.

Reglas:
- NO dupliques lo que ya está anotado (te paso la agenda actual más abajo). Si algo ya existe, no lo crees de nuevo. Si te dan una ACTUALIZACIÓN de algo ya anotado —un tratamiento que ahora dura más o cambió de horario, una rutina que cambió de días/hora, un evento que se movió— editá ESE item con su id (editar_evento / editar_tarea / editar_medicacion / editar_rutina). Nunca crees un segundo registro del mismo tratamiento o de la misma rutina.
- Datos pendientes: cuando anotás un evento o una tarea, fijate qué falta de lo importante —quién se encarga (mamá o papá), la fecha y la hora—. Anotá lo que sí sabés y preguntá por lo que falte en la MISMA línea de confirmación. Una sola pregunta por turno, por el dato más importante que falte (prioridad: responsable > fecha > hora). Ej: "Anoté la cita del pediatra el jueves. ¿Quién lo lleva?".
- NO inventes datos.
- Respuestas cortas. Sos una asistente, no un chatbot que habla de más.
- Cero efusividad, cero signos de exclamación de más, máximo una pregunta por turno.

Gestionás el cuaderno (agenda, tareas, tratamientos, rutinas), no solo anotás. Tu trabajo es SACARLE carga administrativa a los padres: si algo se puede cerrar o limpiar, hacelo vos, no se lo dejes pendiente.
- Cada item en "Ya está anotado" tiene un id entre corchetes (ej. [tarea abc-123]). Para cerrar, cancelar o corregir algo, llamá la tool correspondiente con ESE id.
- CLAVE: una acción SOLO ocurre si llamás la tool. Decir "marco las tres como completadas" o "lo corrijo ahora" SIN llamar a completar_tarea NO cierra nada. Si decís que cerraste/cancelaste/corregiste algo, hacelo en el MISMO turno con la tool. Nunca anuncies una acción que no ejecutaste.
- Si te lo piden de forma directa ("cerrá las tareas pendientes", "borrá el duplicado", "el cumple es a las 5 no a las 4") → hacelo YA, sin pedir confirmación: el pedido ya es la confirmación. Para "cerrá las tareas pendientes" llamá completar_tarea UNA VEZ por cada tarea pendiente del contexto.
- Confirmá ANTES solo cuando la iniciativa es TUYA: si VOS detectás un duplicado o una tarea que un mensaje da por cumplida ("ya compré los pañales"), proponé en una línea ("¿Cierro la tarea de los pañales?") y esperá el sí; cuando confirmen, ejecutá la tool.
- Correcciones y actualizaciones: editá el item existente (editar_evento / editar_tarea / editar_medicacion / editar_rutina) con su id en vez de crear uno nuevo. Aplica también a tratamientos y rutinas.
- Nunca toques (cerrar/cancelar/editar) algo que no esté en "Ya está anotado".`;

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'anotar_evento',
    description: 'Anotar un evento puntual con fecha y hora (cita médica, excursión, cumpleaños, actividad de un día). NO usar para horarios fijos recurrentes — eso es anotar_rutina.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título corto. Ej: "Cumpleaños Pau", "Cita pediatra".' },
        event_type: { type: 'string', enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'] },
        date_start: { type: 'string', description: 'ISO 8601 con hora (YYYY-MM-DDTHH:mm:ss). Resolvé "mañana", "el viernes" usando la fecha actual del contexto. Sin hora explícita usá un default razonable por tipo.' },
        date_end: { type: 'string', description: 'ISO 8601, opcional.' },
        location: { type: 'string' },
        child_name: { type: 'string', description: 'Nombre del hijo. Debe matchear uno de los hijos del contexto.' },
        assigned_to: { type: 'string', enum: ['mama', 'papa'], description: 'Padre responsable si se mencionó ("lo llevo yo", "lo lleva mi pareja").' },
      },
      required: ['title', 'event_type', 'date_start'],
    },
  },
  {
    name: 'anotar_tarea',
    description: 'Anotar una tarea, compra o pago pendiente. Default pendiente. Para una ráfaga con varias compras del mismo plan (ej. fruta + bocaditos para un cumple), podés anotar una tarea por cada cosa.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Ej: "Comprar fruta para el cumple", "Pagar excursión".' },
        status: { type: 'string', enum: ['pending', 'done'] },
        due_date: { type: 'string', description: 'ISO 8601 si hay fecha límite.' },
        assigned_to: { type: 'string', enum: ['mama', 'papa'] },
        child_name: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'anotar_medicacion',
    description: 'Registrar un tratamiento médico con dosis, frecuencia y duración.',
    input_schema: {
      type: 'object',
      properties: {
        medication_name: { type: 'string' },
        child_name: { type: 'string' },
        frequency: { type: 'string', description: 'Ej: "cada 8 horas".' },
        schedule_times: { type: 'array', items: { type: 'string' }, description: 'HH:MM. Ej: ["08:00","16:00","00:00"].' },
        duration_days: { type: 'number' },
        start_date: { type: 'string', description: 'ISO date.' },
        end_date: { type: 'string', description: 'ISO date.' },
      },
      required: ['medication_name'],
    },
  },
  {
    name: 'anotar_rutina',
    description: 'Anotar una RUTINA SEMANAL (horario fijo recurrente: guardería, cole, fútbol semanal). NO para eventos puntuales.',
    input_schema: {
      type: 'object',
      properties: {
        child_name: { type: 'string' },
        name: { type: 'string', description: 'Ej: "Guardería", "Fútbol".' },
        type: { type: 'string', enum: ['school', 'activity', 'meal', 'morning', 'afternoon', 'night', 'custom'] },
        days_of_week: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: '0=dom..6=sáb. [1,2,3,4,5]=L-V.' },
        time_start: { type: 'string', description: 'HH:MM 24h.' },
        time_end: { type: 'string', description: 'HH:MM 24h.' },
      },
      required: ['child_name', 'name', 'type', 'days_of_week', 'time_start'],
    },
  },
  {
    name: 'completar_tarea',
    description: 'Marcar una tarea como cumplida/cerrada. Confirmá antes. Usar el id de una tarea que esté en "Ya está anotado".',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id de la tarea (del bloque "Ya está anotado").' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cancelar_item',
    description: 'Cancelar (reversible) un registro: un duplicado, algo que se canceló o que ya no va. Confirmá antes. Usar el id del bloque "Ya está anotado".',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id del item.' },
        tipo: { type: 'string', enum: ['evento', 'tarea', 'rutina', 'tratamiento'], description: 'Qué tipo de item es (según en qué lista del bloque "Ya está anotado" aparece).' },
      },
      required: ['id', 'tipo'],
    },
  },
  {
    name: 'editar_evento',
    description: 'Corregir un evento existente (cambió la hora, el lugar, el título). Incluí solo los campos que cambian. NO crees uno nuevo para una corrección.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id del evento.' },
        title: { type: 'string' },
        event_type: { type: 'string', enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'] },
        date_start: { type: 'string', description: 'ISO 8601 con hora.' },
        date_end: { type: 'string', description: 'ISO 8601, opcional.' },
        location: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'editar_tarea',
    description: 'Corregir una tarea existente (título, fecha límite, responsable). Incluí solo los campos que cambian.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id de la tarea.' },
        title: { type: 'string' },
        due_date: { type: 'string', description: 'ISO 8601.' },
        assigned_to: { type: 'string', enum: ['mama', 'papa'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'editar_medicacion',
    description: 'Actualizar un tratamiento existente (cambió la frecuencia, los horarios, la duración o la fecha de fin). Incluí solo los campos que cambian. NO crees un tratamiento nuevo para una actualización del mismo.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id del tratamiento (del bloque "Ya está anotado").' },
        medication_name: { type: 'string' },
        frequency: { type: 'string', description: 'Ej: "cada 6 horas".' },
        schedule_times: { type: 'array', items: { type: 'string' }, description: 'HH:MM.' },
        duration_days: { type: 'number' },
        start_date: { type: 'string', description: 'ISO date.' },
        end_date: { type: 'string', description: 'ISO date.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'editar_rutina',
    description: 'Actualizar una rutina existente (cambió el horario, los días o el nombre). Incluí solo los campos que cambian. NO crees una rutina nueva para una actualización de la misma.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id de la rutina (del bloque "Ya está anotado").' },
        name: { type: 'string' },
        days_of_week: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: '0=dom..6=sáb.' },
        time_start: { type: 'string', description: 'HH:MM 24h.' },
        time_end: { type: 'string', description: 'HH:MM 24h.' },
      },
      required: ['id'],
    },
  },
];

// ────────────────────────────────────────────────────────────
// Orquestador
// ────────────────────────────────────────────────────────────

export async function runAssistant(input: AssistantInput): Promise<AssistantResult> {
  const start = Date.now();
  const now = input.now ?? new Date();
  const admin = getSupabaseAdmin();

  // ── Cargar contexto: familia, hijos, parents, conversación, lo ya anotado ──
  const [
    { data: family },
    { data: children },
    { data: parents },
    { data: recentMessages },
    { data: events },
    { data: tasks },
    { data: medications },
  ] = await Promise.all([
    admin.from('families').select('timezone').eq('id', input.familyId).maybeSingle(),
    admin.from('children').select('id, name').eq('family_id', input.familyId),
    admin.from('parents').select('id, name, role').eq('family_id', input.familyId),
    admin.from('messages')
      .select('content, sender_type, sender_id, created_at')
      .eq('family_id', input.familyId)
      .order('created_at', { ascending: false })
      .limit(CONVERSATION_WINDOW),
    admin.from('events')
      .select('id, title, date_start, child_id')
      .eq('family_id', input.familyId)
      .neq('status', 'cancelled')
      .gte('date_start', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
      .order('date_start', { ascending: true })
      .limit(30),
    admin.from('tasks')
      .select('id, title, status, child_id')
      .eq('family_id', input.familyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(30),
    admin.from('medications')
      .select('id, medication_name, child_name, status, frequency, schedule_times, start_date, end_date')
      .eq('family_id', input.familyId)
      .eq('status', 'active')
      .limit(20),
  ]);

  const childrenList = (children || []) as { id: string; name: string }[];
  const parentsList = (parents || []) as { id: string; name: string; role: 'mama' | 'papa' }[];

  const childByName = new Map<string, string>();
  const childById = new Map<string, string>();
  for (const c of childrenList) {
    childByName.set(c.name.toLowerCase().trim(), c.id);
    childById.set(c.id, c.name);
  }
  const parentByRole = new Map<'mama' | 'papa', string>();
  const parentById = new Map<string, string>();
  for (const p of parentsList) {
    parentByRole.set(p.role, p.id);
    parentById.set(p.id, p.name);
  }

  // Rutinas activas (la tabla routines no tiene family_id: se scopea por child).
  const familyChildIds = childrenList.map(c => c.id);
  const { data: routines } = familyChildIds.length
    ? await admin.from('routines')
        .select('id, name, child_id, days_of_week, time_start')
        .in('child_id', familyChildIds)
        .eq('active', true)
        .limit(30)
    : { data: [] as { id: string; name: string; child_id: string; days_of_week: number[]; time_start: string | null }[] };

  // ── Renderizar la conversación (cronológica, último abajo) ──
  const msgs = ((recentMessages || []) as {
    content: string; sender_type: 'parent' | 'nanny'; sender_id: string | null; created_at: string;
  }[]).slice().reverse();

  const conversationText = msgs.map(m => {
    const who = m.sender_type === 'nanny'
      ? 'Nanny'
      : (m.sender_id && parentById.get(m.sender_id)) || 'Padre';
    return `${who}: ${m.content}`;
  }).join('\n');

  // ── Renderizar lo ya anotado (para no duplicar) ──
  const agendaLines: string[] = [];
  for (const e of (events || []) as { id: string; title: string; date_start: string; child_id: string | null }[]) {
    const child = e.child_id ? childById.get(e.child_id) : null;
    agendaLines.push(`- [evento ${e.id}] ${e.title} (${e.date_start}${child ? `, ${child}` : ''})`);
  }
  for (const t of (tasks || []) as { id: string; title: string; child_id: string | null }[]) {
    const child = t.child_id ? childById.get(t.child_id) : null;
    agendaLines.push(`- [tarea ${t.id}] ${t.title}${child ? ` (${child})` : ''}`);
  }
  for (const m of (medications || []) as { id: string; medication_name: string; child_name: string; frequency: string | null; schedule_times: string[] | null; start_date: string | null; end_date: string | null }[]) {
    const det: string[] = [];
    if (m.frequency) det.push(m.frequency);
    if (m.schedule_times?.length) det.push(m.schedule_times.map(t => t.slice(0, 5)).join('/'));
    if (m.end_date) det.push(`hasta ${m.end_date.slice(0, 10)}`);
    agendaLines.push(`- [tratamiento ${m.id}] ${m.medication_name}${m.child_name ? ` (${m.child_name})` : ''}${det.length ? ` — ${det.join(', ')}` : ''}`);
  }
  for (const r of (routines || []) as { id: string; name: string; child_id: string; days_of_week: number[]; time_start: string | null }[]) {
    const child = childById.get(r.child_id);
    const dias = (r.days_of_week || []).map(d => ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d]).join('');
    agendaLines.push(`- [rutina ${r.id}] ${r.name}${child ? ` (${child})` : ''}${dias ? `, ${dias}` : ''}${r.time_start ? ` ${r.time_start.slice(0, 5)}` : ''}`);
  }
  const agendaText = agendaLines.length > 0 ? agendaLines.join('\n') : '(nada anotado todavía)';

  const childrenNames = childrenList.map(c => c.name).join(', ') || '(sin hijos cargados)';
  const tz = (family as { timezone?: string } | null)?.timezone || 'America/Argentina/Buenos_Aires';
  const fecha = now.toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  });

  const contextBlock = `Hoy es ${fecha} (zona horaria de la familia: ${tz}).
Hijos de la familia: ${childrenNames}.
Quien escribió el último mensaje: ${input.senderName} (${input.senderRole}).

Ya está anotado (NO lo dupliques):
${agendaText}

Conversación reciente del chat:
${conversationText}`;

  // ── Una sola llamada a Claude ──
  const client = getClient();
  let message: Anthropic.Messages.Message;
  try {
    message = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: TOOLS,
      messages: [{ role: 'user', content: contextBlock }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[assistant] anthropic error', { familyId: input.familyId, error: msg });
    return { reply: null, items: [], cost_usd: 0, latency_ms: Date.now() - start };
  }

  // ── Separar texto (reply) de tool calls (acciones) ──
  const replyText = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map(b => b.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  const toolUses = message.content.filter(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
  );

  // ── Ejecutar las acciones (persistir) ──
  const items: AssistantCapturedItem[] = [];
  for (const block of toolUses) {
    try {
      const item = await persistTool({
        familyId: input.familyId,
        senderId: parentByRole.get(input.senderRole) ?? null,
        block,
        childByName,
        parentByRole,
      });
      if (item) items.push(item);
    } catch (err) {
      console.error('[assistant] persist error', { tool: block.name, error: err instanceof Error ? err.message : err });
    }
  }

  const usage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };
  const cost_usd = computeCost(usage);
  const latency_ms = Date.now() - start;

  // Fallback: si el modelo anotó algo pero no escribió confirmación, generamos
  // un acuse mínimo para que el padre tenga feedback.
  let reply: string | null = replyText.length > 0 ? replyText : null;
  if (!reply && items.length > 0) {
    const titlesFor = (a: string) => items.filter(i => (i.action ?? 'create') === a).map(i => i.title);
    const created = titlesFor('create');
    const closed = titlesFor('complete');
    const cancelled = titlesFor('cancel');
    const edited = titlesFor('edit');
    const parts: string[] = [];
    if (created.length) parts.push(`Anotado: ${created.join(', ')}`);
    if (closed.length) parts.push(`Cerré: ${closed.join(', ')}`);
    if (cancelled.length) parts.push(`Cancelé: ${cancelled.join(', ')}`);
    if (edited.length) parts.push(`Actualicé: ${edited.join(', ')}`);
    reply = parts.length ? `${parts.join('. ')}.` : null;
  }

  console.log('[assistant]', {
    familyId: input.familyId,
    items: items.length,
    replied: !!reply,
    latency_ms,
    cost_usd,
  });

  return { reply, items, cost_usd, latency_ms };
}

// ────────────────────────────────────────────────────────────
// Persistencia por herramienta
// ────────────────────────────────────────────────────────────

async function persistTool(args: {
  familyId: string;
  senderId: string | null;
  block: Anthropic.Messages.ToolUseBlock;
  childByName: Map<string, string>;
  parentByRole: Map<'mama' | 'papa', string>;
}): Promise<AssistantCapturedItem | null> {
  const { familyId, senderId, block, childByName, parentByRole } = args;
  const admin = getSupabaseAdmin();
  const input = block.input as Record<string, unknown>;

  const childName = strField(input.child_name);
  const childId = childName ? (childByName.get(childName.toLowerCase()) ?? null) : null;

  const assignedRole = typeof input.assigned_to === 'string'
    ? (input.assigned_to.toLowerCase() as 'mama' | 'papa')
    : null;
  const assignedToId = assignedRole === 'mama' || assignedRole === 'papa'
    ? (parentByRole.get(assignedRole) ?? null)
    : null;

  if (block.name === 'anotar_evento') {
    const title = strField(input.title);
    const dateStart = strField(input.date_start);
    if (!title || !dateStart) return null;
    const { data, error } = await admin.from('events').insert({
      family_id: familyId,
      child_id: childId,
      title,
      description: null,
      event_type: strField(input.event_type) || 'other',
      date_start: dateStart,
      date_end: strField(input.date_end) || null,
      location: strField(input.location) || null,
      status: 'pending',
      source: 'assistant',
      auto_detected: true,
      created_by: senderId,
      ...(assignedToId ? { assigned_to: assignedToId } : {}),
    }).select('id, title').single();
    if (error || !data) { console.error('[assistant] event insert error', error); return null; }
    return { type: 'event', id: data.id, title: data.title };
  }

  if (block.name === 'anotar_tarea') {
    const title = strField(input.title);
    if (!title) return null;
    const status = (input.status === 'done' ? 'done' : 'pending') as 'pending' | 'done';
    const { data, error } = await admin.from('tasks').insert({
      family_id: familyId,
      child_id: childId,
      parent_task_id: null,
      title,
      description: null,
      assigned_to: assignedToId,
      due_date: strField(input.due_date) || null,
      status,
      priority: 'normal',
      source: 'assistant',
      auto_detected: true,
      created_by: senderId,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    }).select('id, title').single();
    if (error || !data) { console.error('[assistant] task insert error', error); return null; }
    return { type: 'task', id: data.id, title: data.title };
  }

  if (block.name === 'anotar_medicacion') {
    const medName = strField(input.medication_name);
    if (!medName) return null;
    const scheduleTimes = Array.isArray(input.schedule_times)
      ? input.schedule_times.filter((t): t is string => typeof t === 'string') : [];
    const { data, error } = await admin.from('medications').insert({
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
      source: 'assistant',
      auto_detected: true,
      created_by: senderId,
    }).select('id, medication_name').single();
    if (error || !data) { console.error('[assistant] medication insert error', error); return null; }
    return { type: 'medication', id: data.id, title: data.medication_name };
  }

  if (block.name === 'anotar_rutina') {
    const routineName = strField(input.name);
    const timeStart = strField(input.time_start);
    if (!routineName || !childId || !timeStart) return null;
    const days = Array.isArray(input.days_of_week)
      ? input.days_of_week.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6) : [];
    if (days.length === 0) return null;
    const { data, error } = await admin.from('routines').insert({
      child_id: childId,
      type: strField(input.type) || 'custom',
      name: routineName,
      description: null,
      days_of_week: days,
      time_start: timeStart,
      time_end: strField(input.time_end) || null,
      active: true,
    }).select('id, name').single();
    if (error || !data) { console.error('[assistant] routine insert error', error); return null; }
    return { type: 'routine', id: data.id, title: data.name };
  }

  // ── Gestión: completar / cancelar / editar (scope por familia) ──

  if (block.name === 'completar_tarea') {
    const id = strField(input.id);
    if (!id) return null;
    const { data, error } = await admin.from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', id).eq('family_id', familyId)
      .select('id, title');
    const affected = data?.length ?? 0;
    if (error || !affected) { console.warn('[assistant] completar_tarea sin efecto', { id, affected, error: error?.message }); return null; }
    console.log('[assistant] completar_tarea', { id, title: data![0].title });
    return { type: 'task', id, title: data![0].title, action: 'complete' };
  }

  if (block.name === 'cancelar_item') {
    const id = strField(input.id);
    const tipo = strField(input.tipo);
    if (!id) return null;
    let title = '';
    let affected = 0;
    let type: AssistantCapturedItem['type'] = 'task';
    if (tipo === 'evento') {
      const { data } = await admin.from('events').update({ status: 'cancelled' }).eq('id', id).eq('family_id', familyId).select('id, title');
      affected = data?.length ?? 0; title = data?.[0]?.title ?? ''; type = 'event';
    } else if (tipo === 'tarea') {
      const { data } = await admin.from('tasks').update({ status: 'cancelled' }).eq('id', id).eq('family_id', familyId).select('id, title');
      affected = data?.length ?? 0; title = data?.[0]?.title ?? ''; type = 'task';
    } else if (tipo === 'tratamiento') {
      const { data } = await admin.from('medications').update({ status: 'cancelled' }).eq('id', id).eq('family_id', familyId).select('id, medication_name');
      affected = data?.length ?? 0; title = data?.[0]?.medication_name ?? ''; type = 'medication';
    } else if (tipo === 'rutina') {
      const childIds = [...childByName.values()];
      if (childIds.length) {
        const { data } = await admin.from('routines').update({ active: false }).eq('id', id).in('child_id', childIds).select('id, name');
        affected = data?.length ?? 0; title = data?.[0]?.name ?? ''; type = 'routine';
      }
    }
    if (!affected) { console.warn('[assistant] cancelar_item sin efecto', { id, tipo }); return null; }
    console.log('[assistant] cancelar_item', { id, tipo, title });
    return { type, id, title, action: 'cancel' };
  }

  if (block.name === 'editar_evento') {
    const id = strField(input.id);
    if (!id) return null;
    const patch: Record<string, unknown> = {};
    if (strField(input.title)) patch.title = strField(input.title);
    if (strField(input.event_type)) patch.event_type = strField(input.event_type);
    if (strField(input.date_start)) patch.date_start = strField(input.date_start);
    if (strField(input.date_end)) patch.date_end = strField(input.date_end);
    if (strField(input.location)) patch.location = strField(input.location);
    if (!Object.keys(patch).length) return null;
    const { data, error } = await admin.from('events').update(patch).eq('id', id).eq('family_id', familyId).select('id, title');
    const affected = data?.length ?? 0;
    if (error || !affected) { console.warn('[assistant] editar_evento sin efecto', { id, affected, error: error?.message }); return null; }
    return { type: 'event', id, title: data![0].title, action: 'edit' };
  }

  if (block.name === 'editar_tarea') {
    const id = strField(input.id);
    if (!id) return null;
    const patch: Record<string, unknown> = {};
    if (strField(input.title)) patch.title = strField(input.title);
    if (strField(input.due_date)) patch.due_date = strField(input.due_date);
    if (assignedToId) patch.assigned_to = assignedToId;
    if (!Object.keys(patch).length) return null;
    const { data, error } = await admin.from('tasks').update(patch).eq('id', id).eq('family_id', familyId).select('id, title');
    const affected = data?.length ?? 0;
    if (error || !affected) { console.warn('[assistant] editar_tarea sin efecto', { id, affected, error: error?.message }); return null; }
    return { type: 'task', id, title: data![0].title, action: 'edit' };
  }

  if (block.name === 'editar_medicacion') {
    const id = strField(input.id);
    if (!id) return null;
    const patch: Record<string, unknown> = {};
    if (strField(input.medication_name)) patch.medication_name = strField(input.medication_name);
    if (strField(input.frequency)) patch.frequency = strField(input.frequency);
    if (Array.isArray(input.schedule_times)) {
      patch.schedule_times = input.schedule_times.filter((t): t is string => typeof t === 'string');
    }
    if (typeof input.duration_days === 'number') patch.duration_days = input.duration_days;
    if (strField(input.start_date)) patch.start_date = strField(input.start_date);
    if (strField(input.end_date)) patch.end_date = strField(input.end_date);
    if (!Object.keys(patch).length) return null;
    const { data, error } = await admin.from('medications').update(patch).eq('id', id).eq('family_id', familyId).select('id, medication_name');
    const affected = data?.length ?? 0;
    if (error || !affected) { console.warn('[assistant] editar_medicacion sin efecto', { id, affected, error: error?.message }); return null; }
    return { type: 'medication', id, title: data![0].medication_name, action: 'edit' };
  }

  if (block.name === 'editar_rutina') {
    const id = strField(input.id);
    if (!id) return null;
    const childIds = [...childByName.values()];
    if (!childIds.length) return null;
    const patch: Record<string, unknown> = {};
    if (strField(input.name)) patch.name = strField(input.name);
    if (Array.isArray(input.days_of_week)) {
      const days = input.days_of_week.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
      if (days.length) patch.days_of_week = days;
    }
    if (strField(input.time_start)) patch.time_start = strField(input.time_start);
    if (strField(input.time_end)) patch.time_end = strField(input.time_end);
    if (!Object.keys(patch).length) return null;
    const { data, error } = await admin.from('routines').update(patch).eq('id', id).in('child_id', childIds).select('id, name');
    const affected = data?.length ?? 0;
    if (error || !affected) { console.warn('[assistant] editar_rutina sin efecto', { id, affected, error: error?.message }); return null; }
    return { type: 'routine', id, title: data![0].name, action: 'edit' };
  }

  return null;
}

function strField(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function computeCost(u: {
  input_tokens: number; output_tokens: number;
  cache_creation_input_tokens: number; cache_read_input_tokens: number;
}): number {
  const total =
    (u.input_tokens / 1e6) * PRICE_PER_MTOK.input +
    (u.cache_creation_input_tokens / 1e6) * PRICE_PER_MTOK.cache_write +
    (u.cache_read_input_tokens / 1e6) * PRICE_PER_MTOK.cache_read +
    (u.output_tokens / 1e6) * PRICE_PER_MTOK.output;
  return Math.round(total * 1e6) / 1e6;
}
