/**
 * Paso 2 del pipeline: Extraer datos estructurados via OpenAI tool calling.
 *
 * Reescrito en Fase 4 del RELIABILITY-PLAN.md: en lugar de pedir JSON via
 * instrucciones en el prompt (con catch silencioso si el formato fallaba), el
 * modelo invoca tools tipadas. El `content` textual del modelo es el reply
 * (receipt), las `tool_calls` son las acciones estructuradas.
 *
 * El catch silencioso anterior devolvía intent: stay_silent + confirmation: null
 * cuando el JSON parse fallaba — esa es la fuente principal de detecciones
 * perdidas que motivó el plan. Esta versión NUNCA descarta silenciosamente:
 * cualquier anomalía se loguea y devuelve fallback explícito.
 *
 * La firma `ExtractorOutput` se mantiene idéntica a la versión anterior para
 * no obligar a tocar pipeline ni postprocess.
 */

import OpenAI from 'openai';
import { buildRulesText } from './prompt-rules';
import { EXTRACTOR_TOOLS } from './tools';

export interface ExtractorInput {
  message: string;
  senderName: string;
  senderRole: 'mama' | 'papa';
  intent: string;
  complexity: 'simple' | 'ambiguous' | 'complex';
  familyContext: string;
  recentMessages: string;
  existingEvents: string;
  existingTasks: string;
  activeMedications: string;
  existingRoutines: string;
  pendingDetection: Record<string, unknown> | null;
  currentDate: string;
}

export interface ExtractorOutput {
  reply: string;
  intent: string;
  next_action: string;
  child: string | null;
  confirmation: { type: string; data: Record<string, unknown> } | null;
  additional_confirmations: { type: string; data: Record<string, unknown> }[];
  pending_detection: { type: string; partial_data: Record<string, unknown>; missing: string[]; summary: string } | null;
  task_group: { parent_title: string; child_name: string | null } | null;
}

const EXTRACTOR_SYSTEM_PROMPT = `Eres Nanny, asistente de coordinación familiar. Tu trabajo es DETECTAR y EXTRAER acciones del mensaje, e invocar las tools correspondientes con datos estructurados.

QUIÉN ESCRIBE: {sender_name} (es {sender_role})
FECHA ACTUAL: {current_date}
INTENT DETECTADO POR EL CLASIFICADOR: {intent}

CONTEXTO FAMILIAR:
{family_context}

EVENTOS AGENDADOS: {existing_events}
TAREAS PENDIENTES: {existing_tasks}
MEDICAMENTOS ACTIVOS: {active_medications}
RUTINAS SEMANALES: {existing_routines}

MENSAJES RECIENTES:
{recent_messages}

DETECCIÓN PENDIENTE:
{pending_detection}

═══════════════════════════════════════
TOOLS DISPONIBLES (descripción resumida — el schema completo está en cada tool):
═══════════════════════════════════════

- create_event: evento puntual con fecha (cita, excursión, cumpleaños).
- create_task: tarea/compra/pago. Acepta parent_title para agrupar bajo tarea paraguas.
- create_medication: tratamiento médico con dosis y frecuencia.
- create_routine: horario fijo recurrente (guardería, fútbol semanal).
- create_routine_exception: cancelación puntual de UN día de una rutina.
- update_existing_event: modificar evento ya creado.
- update_existing_task: modificar tarea ya creada.
- ask_for_missing_info: detección incompleta — falta info crítica.
- stay_silent: no hay acción accionable.

Podés invocar VARIAS tools en paralelo si el mensaje contiene múltiples acciones
("compré pañales y ya hice la inscripción del cole" → create_task done +
create_task done o + create_event según el caso).

═══════════════════════════════════════
REGLAS DE EXTRACCIÓN:
═══════════════════════════════════════

0. **PRIORIDAD MÁXIMA — RUTINA SEMANAL DETECTADA**:
   Si el mensaje describe un horario REPETIDO (X de días de la semana de hora a hora),
   sin importar el intent del classifier, invocá create_routine.
   Patrones que califican:
   - "[hijo] tiene/va a [actividad] de [días] de [hora] a [hora]"
   - "[hijo] hace [actividad] los [día] y [día] a las [hora]"
   - "[actividad] [días] [hora]-[hora]"
   Si la conversación reciente preguntó "¿registro como rutina?" y el padre acaba de
   responder con días+horas, ESO ES la creación: invocá create_routine, no preguntes.

   FORMATO HORAS: "9 a 4:30" en contexto de día completo = "09:00"–"16:30"
   (PM implícito si la hora final es menor a la inicial). "9 a 17" = "09:00"–"17:00".
   Normalizá siempre a HH:MM 24h.

1. ASSIGNED_TO: Usá "mama" o "papa" (literal). {sender_name} es {sender_role}.
   - "yo lo hago/llevo/recojo/compro" → assigned_to = "{sender_role}"
   - "tú encárgate/pasa por" → el OTRO rol
   - "ok/dale/va" aceptando una solicitud → "{sender_role}"
   - PATRÓN HISTÓRICO: si en EVENTOS/TAREAS existentes ves que un padre siempre se
     encarga de cierto tipo, INFERILO. NO justifiques la inferencia en el reply.

2. FECHAS: Calculá desde {current_date}.
   - "mañana" = día siguiente
   - "el lunes" = próximo lunes (si hoy es lunes, el próximo)
   - "este viernes" = viernes de esta semana
   - Sin hora explícita: médico 10:00, escolar 08:00, actividad 16:00.

3. COMPRENSIÓN CONVERSACIONAL — leé MENSAJES RECIENTES como un HILO:
   - "sí/dale/ok/va/perfecto" → buscá QUÉ están confirmando.
   - "a las 3" sin más contexto → buscá de qué evento/tarea hablan.
   - "yo no puedo" → identificá QUÉ.
   - Si hay pending_detection activa, prioridad: completarla con la nueva info.

4. PENDING DETECTION: si hay una activa y el mensaje la complementa, COMPLETALA
   invocando la tool create_X correspondiente con los datos del pending + lo nuevo.
   Si seguís sin tener todo, invocá ask_for_missing_info actualizando partial_data.

5. MÚLTIPLES DETECCIONES: si hay varios ítems accionables, invocá UNA tool por
   cada uno en paralelo. No mezcles tipos en una sola call.

6. NO DUPLICAR: si ya existe en EVENTOS/TAREAS/MEDICAMENTOS, NO invoques create_X.
   Usá update_existing_event o update_existing_task con el id.

7. FALSOS POSITIVOS — NO crees nada para:
   - Síntomas sin tratamiento (fiebre, tos): invocá stay_silent (intent HEALTH_LOG
     lo maneja el responder/postprocess; el extractor solo declara que no hay acción).
   - Preguntas que piden info: stay_silent.
   - Preocupaciones sin acción concreta: stay_silent.

8. REPLY (= content textual) — innegociable:
   - Default UNA oración. Máximo 2. Solo 3 si reportás varios temas a la vez.
   - Cero exclamaciones. Nunca "¡Listo!", "Genial", "Perfecto". Decí "Anotado." o
     "Pediatra martes 10am, papá la lleva."
   - Cero efusividad. Sin emojis decorativos. En temas médicos: cero emojis.
   - UNA SOLA PREGUNTA POR TURNO. Si faltan 2 datos, elegí el más crítico:
     prioridad: asignación (quién) > horario > ubicación > resto.
   - No te justifiques. No expliques tu razonamiento. Reportá el resultado.
   - Si una toma de decisión queda registrada (delegación clara con asignación), reply
     puede ser muy breve: "Anotado."
   - PREGUNTAS POR ASIGNACIÓN AGRUPADAS: si hay VARIAS sub-tareas creadas sin
     asignar, NO hagas una pregunta por cada una. Hacé UNA sola consolidada al final
     mencionando los items sin dueño.
       Ej: "Anotado bajo Cumpleaños Pau: 2 hechas, 2 pendientes. ¿Quién se encarga
            de la decoración y las sorpresitas?"
     Si hay UNA sola pendiente sin asignar, también una pregunta breve.
   - Si invocás ask_for_missing_info, el reply ES la pregunta breve por lo que falta.
     Ej: "Anoté cita pediatra mañana. ¿A qué hora? ¿Quién la lleva?" (una pregunta;
     elegí la más crítica).

9. TASK GROUP (parent_title): cuando el mensaje contiene múltiples actividades del
   mismo "topic paraguas" (cumpleaños, viaje, mudanza, fiesta, inicio escolar),
   invocá create_task UNA VEZ por cada actividad e incluí parent_title con el
   título del topic + parent_child_name si aplica. Ej: "Cumpleaños Pau".
   El sistema crea automáticamente la tarea padre y enlaza las hijas.
   Reply en este caso reporta el receipt agrupado:
   "Anotado bajo «Cumpleaños Pau»: 2 hechas, 2 pendientes."

10. STATUS de tarea: pending para acciones futuras ("hay que comprar"), done para
    acciones pasadas reportadas ("ya compré X") — pero solo emitir done dentro de
    un task_group con otras pending. Una acción pasada AISLADA sin grupo NO genera
    tarea (invocá stay_silent o no invoques tool).

11. RUTINA EXCEPTION: si el mensaje cancela un día específico de una rutina existente
    ("el viernes no hay guardería"), buscá la rutina en RUTINAS SEMANALES por hijo
    + tipo y usá su id en routine_id. Si no existe rutina coincidente, NO inventes —
    invocá ask_for_missing_info.

═══════════════════════════════════════
SI NO HAY ACCIÓN ACCIONABLE, INVOCÁ stay_silent.
NUNCA dejes la respuesta sin tool call: el modelo SIEMPRE invoca al menos una.
═══════════════════════════════════════`;

interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export async function extractData(
  openai: OpenAI,
  input: ExtractorInput,
  model: string = 'gpt-4o-mini'
): Promise<ExtractorOutput> {
  const pendingStr = input.pendingDetection
    ? `ACTIVA: ${JSON.stringify(input.pendingDetection)}\nSi el mensaje complementa esta detección, COMPLETALA invocando la tool create_X correspondiente.`
    : 'Ninguna';

  const extraRules = await buildRulesText('extractor');
  const prompt = (EXTRACTOR_SYSTEM_PROMPT + extraRules)
    .replace(/{sender_name}/g, input.senderName)
    .replace(/{sender_role}/g, input.senderRole)
    .replace('{current_date}', input.currentDate)
    .replace('{intent}', input.intent)
    .replace('{family_context}', input.familyContext)
    .replace('{existing_events}', input.existingEvents || 'Ninguno')
    .replace('{existing_tasks}', input.existingTasks || 'Ninguna')
    .replace('{active_medications}', input.activeMedications || 'Ninguno')
    .replace('{existing_routines}', input.existingRoutines || 'Ninguna')
    .replace('{recent_messages}', input.recentMessages || 'Ninguno')
    .replace('{pending_detection}', pendingStr);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 700,
    temperature: 0.3,
    tools: EXTRACTOR_TOOLS,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input.message },
    ],
  });

  const message = response.choices[0]?.message;
  const reply = (message?.content || '').trim();
  const toolCalls = parseToolCalls(message?.tool_calls);

  return mapToExtractorOutput(input, reply, toolCalls);
}

function parseToolCalls(
  rawCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
): ParsedToolCall[] {
  if (!rawCalls || rawCalls.length === 0) return [];
  const parsed: ParsedToolCall[] = [];
  for (const call of rawCalls) {
    if (call.type !== 'function') continue;
    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch (err) {
      console.warn('[extractor] tool call args parse error:', call.function.name, err);
      continue;
    }
    parsed.push({ name: call.function.name, args });
  }
  return parsed;
}

function mapToExtractorOutput(
  input: ExtractorInput,
  reply: string,
  toolCalls: ParsedToolCall[],
): ExtractorOutput {
  const out: ExtractorOutput = {
    reply,
    intent: input.intent,
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
    task_group: null,
  };

  if (toolCalls.length === 0) {
    // El modelo no invocó tools — caso poco común si el system prompt insiste en
    // "siempre invoques al menos una". Logueamos para detectar drift.
    console.warn('[extractor] no tool calls returned; reply len:', reply.length);
    return out;
  }

  // Confirmations accionables y sus tipos en orden de aparición.
  const confirmations: { type: string; data: Record<string, unknown> }[] = [];
  let firstActionableTool: string | null = null;
  let pendingFromTool: ExtractorOutput['pending_detection'] = null;
  let firstChild: string | null = null;
  let taskGroup: ExtractorOutput['task_group'] = null;

  for (const call of toolCalls) {
    switch (call.name) {
      case 'create_event': {
        const data = pickEventData(call.args);
        if (firstChild === null && typeof data.child === 'string') firstChild = data.child;
        confirmations.push({ type: 'event', data });
        if (!firstActionableTool) firstActionableTool = 'create_event';
        break;
      }
      case 'create_task': {
        const { data, parentTitle, parentChildName } = pickTaskData(call.args);
        if (firstChild === null && typeof data.child === 'string') firstChild = data.child;
        if (parentTitle && !taskGroup) {
          taskGroup = { parent_title: parentTitle, child_name: parentChildName || null };
        }
        confirmations.push({ type: 'task', data });
        if (!firstActionableTool) firstActionableTool = 'create_task';
        break;
      }
      case 'create_medication': {
        const data = pickMedicationData(call.args);
        if (firstChild === null && typeof data.child === 'string') firstChild = data.child;
        confirmations.push({ type: 'medication', data });
        if (!firstActionableTool) firstActionableTool = 'create_medication';
        break;
      }
      case 'create_routine': {
        const data = pickRoutineData(call.args);
        if (firstChild === null && typeof data.child_name === 'string') firstChild = data.child_name;
        confirmations.push({ type: 'routine', data });
        if (!firstActionableTool) firstActionableTool = 'create_routine';
        break;
      }
      case 'create_routine_exception': {
        const data = pickRoutineExceptionData(call.args);
        confirmations.push({ type: 'routine_exception', data });
        if (!firstActionableTool) firstActionableTool = 'create_routine_exception';
        break;
      }
      case 'update_existing_event':
        if (!firstActionableTool) firstActionableTool = 'update_existing_event';
        break;
      case 'update_existing_task':
        if (!firstActionableTool) firstActionableTool = 'update_existing_task';
        break;
      case 'ask_for_missing_info':
        if (!pendingFromTool) {
          pendingFromTool = pickPendingDetection(call.args);
        }
        if (!firstActionableTool) firstActionableTool = 'ask_for_missing_info';
        break;
      case 'stay_silent':
        // No-op: solo señaliza ausencia de acción.
        if (!firstActionableTool) firstActionableTool = 'stay_silent';
        break;
      default:
        console.warn('[extractor] unknown tool call:', call.name);
    }
  }

  if (confirmations.length > 0) {
    out.confirmation = confirmations[0];
    out.additional_confirmations = confirmations.slice(1);
  }
  if (pendingFromTool) out.pending_detection = pendingFromTool;
  if (firstChild) out.child = firstChild;
  if (taskGroup) out.task_group = taskGroup;
  out.next_action = deriveNextAction(firstActionableTool, pendingFromTool);

  return out;
}

function deriveNextAction(
  firstTool: string | null,
  pending: ExtractorOutput['pending_detection'],
): string {
  switch (firstTool) {
    case 'create_event': return 'confirm_event';
    case 'create_task': return 'confirm_task';
    case 'create_medication': return 'confirm_medication';
    case 'create_routine': return 'confirm_routine';
    case 'create_routine_exception': return 'cancel_routine_date';
    case 'update_existing_event': return 'update_existing_event';
    case 'update_existing_task': return 'update_existing_task';
    case 'ask_for_missing_info': {
      if (!pending) return 'stay_silent';
      const missing = pending.missing.map(m => m.toLowerCase());
      if (missing.some(m => m.includes('assigned') || m.includes('quien') || m.includes('responsable'))) {
        return 'ask_for_missing_responsible_parent';
      }
      if (missing.some(m => m.includes('date') || m.includes('hora') || m.includes('time'))) {
        return 'ask_for_missing_time';
      }
      return 'stay_silent';
    }
    case 'stay_silent': return 'stay_silent';
    default: return 'stay_silent';
  }
}

// Picks ↓ — copian solo los campos válidos de cada tool al `data` del confirmation.
// Ignoran props desconocidas para que basura del LLM no llegue al postprocess.

function pickEventData(args: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(args, [
    'title', 'event_type', 'date_start', 'date_end', 'date_description',
    'location', 'child', 'assigned_to',
  ]);
}

function pickTaskData(args: Record<string, unknown>): {
  data: Record<string, unknown>;
  parentTitle: string | null;
  parentChildName: string | null;
} {
  const data = pickKeys(args, [
    'title', 'status', 'due_date', 'completed_at', 'assigned_to', 'child',
  ]);
  return {
    data,
    parentTitle: typeof args.parent_title === 'string' ? args.parent_title : null,
    parentChildName: typeof args.parent_child_name === 'string' ? args.parent_child_name : null,
  };
}

function pickMedicationData(args: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(args, [
    'medication_name', 'frequency', 'schedule_times', 'duration_days',
    'start_date', 'end_date', 'child',
  ]);
}

function pickRoutineData(args: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(args, [
    'child_name', 'name', 'type', 'days_of_week', 'time_start', 'time_end',
  ]);
}

function pickRoutineExceptionData(args: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(args, ['routine_id', 'date', 'cancelled', 'reason']);
}

function pickPendingDetection(
  args: Record<string, unknown>,
): ExtractorOutput['pending_detection'] {
  const type = typeof args.type === 'string' ? args.type : 'event';
  const partial = (args.partial_data && typeof args.partial_data === 'object')
    ? args.partial_data as Record<string, unknown>
    : {};
  const missing = Array.isArray(args.missing) ? args.missing.filter(m => typeof m === 'string') as string[] : [];
  const summary = typeof args.summary === 'string' ? args.summary : '';
  return { type, partial_data: partial, missing, summary };
}

function pickKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
