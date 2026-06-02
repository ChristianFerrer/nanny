/**
/**
 * Pipeline de Nanny: orquesta classify → extract → postprocess.
 *
 * Flujo HÍBRIDO (mayo 2026):
 * 1. Classifier (gpt-4o-mini): ¿Es accionable? ¿Qué tipo? ¿Para Nanny? ¿Puede aportar valor?
 * 2a. Si es saludo/pregunta directa/concern/proactive → Responder (gpt-4o-mini)
 * 2b. Si es accionable → Extractor (gpt-4o, siempre)
 * 3. Post-proceso: fix assigned_to, validar FPs
 *
 * El extractor usa el modelo grande porque es el cerebro: function calling,
 * inferencia contextual, múltiples tools en paralelo, comprensión de respuestas
 * cortas con pending activo. Mini fallaba sistemáticamente en estos casos.
 * Costo estimado: ~$0.55/familia/mes (vs ~$0.14 con mini-only).
 */

import OpenAI from 'openai';
import { classifyMessage, type ClassifierOutput } from './classifier';
import { extractData } from './extractor';
import { generateDirectResponse } from './responder';
import { postProcessResponse } from './postprocess';
import { persistCorrectionIfGeneral } from './correction-rules';
import { detectRoutineInMessage } from './routine-detector';
import type { ChatInput, ChatResponse } from './processChat';
import { getSupabaseAdmin } from '@/lib/supabase';

// Cuotas de intervención proactiva (por familia, por día).
// Las intervenciones son "proactivas" cuando Nanny habla sin que un padre
// le pregunte directamente: brief matutino, recordatorios de conflicto,
// info que un padre no tenía. Está fuera de cuota: respuestas a preguntas
// directas, correcciones, médicos, intervenciones tras solicitud explícita.
const PROACTIVE_DAILY_LIMIT = 3;
const ACTIVE_WINDOW_START_HOUR = 7; // 7am
const ACTIVE_WINDOW_END_HOUR = 22;  // 10pm

async function countTodaysProactive(familyId: string | undefined): Promise<number> {
  if (!familyId) return 0;
  try {
    const sb = getSupabaseAdmin();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', familyId)
      .eq('sender_type', 'nanny')
      .filter('metadata->>proactive', 'eq', 'true')
      .gte('created_at', todayStart.toISOString());
    return count || 0;
  } catch {
    return 0;
  }
}

function isInActiveWindow(): boolean {
  const h = new Date().getHours();
  return h >= ACTIVE_WINDOW_START_HOUR && h < ACTIVE_WINDOW_END_HOUR;
}

function silentResponse(intent: string): ChatResponse {
  return {
    should_respond: false,
    reply: '',
    intent,
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
  };
}

/**
 * Determina el rol del sender. Usa el rol enviado por el frontend (de la DB),
 * con fallback a inferencia por emoji si no está disponible.
 */
function getSenderRole(input: ChatInput): 'mama' | 'papa' {
  if (input.senderRole) return input.senderRole;
  const mamaMatch = input.familyContext.match(/(\w+)\s*\(👩\)/);
  const papaMatch = input.familyContext.match(/(\w+)\s*\(👨\)/);
  const senderLower = input.senderName.toLowerCase();
  if (mamaMatch && senderLower.includes(mamaMatch[1].toLowerCase())) return 'mama';
  if (papaMatch && senderLower.includes(papaMatch[1].toLowerCase())) return 'papa';
  return 'mama';
}

function getChildrenNames(familyContext: string): string[] {
  const matches = familyContext.matchAll(/(\w+)\s*\((?:👧|👦|👶)/g);
  return Array.from(matches).map(m => m[1]);
}

async function getActivePromptContent(): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('system_prompts')
      .select('content')
      .eq('is_active', true)
      .single();
    return data?.content || null;
  } catch {
    return null;
  }
}

/**
 * Tipo de evento que el pipeline puede emitir.
 *
 * - `will_respond`: emitido apenas el classifier termina (antes del extractor /
 *   responder). Permite al cliente decidir si mostrar la animación de los 3
 *   puntos. value=true significa que SÍ va a llegar un mensaje de Nanny.
 * - `response`: el resultado final completo.
 */
export type ChatStreamEvent =
  | { type: 'will_respond'; value: boolean }
  | { type: 'response'; response: ChatResponse };

/**
 * Pipeline en modo streaming. Emite primero `will_respond` (apenas el
 * classifier decide), después `response` (cuando termina extractor/responder).
 *
 * Esto permite que el cliente prenda la animación de los 3 puntos SOLO
 * cuando Nanny realmente va a escribir algo, no cuando solo está procesando.
 */
export async function* processChatPipelineStream(input: ChatInput): AsyncGenerator<ChatStreamEvent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada en el servidor.');
  }

  const openai = new OpenAI({ apiKey });
  const senderRole = getSenderRole(input);
  const childrenNames = getChildrenNames(input.familyContext);

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0] +
    ' (' + now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ') ' +
    now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  // ═══════════════════════════════════════
  // PASO 1: Clasificar
  // ═══════════════════════════════════════
  const classification = await classifyMessage(openai, {
    message: input.message,
    senderName: input.senderName,
    senderRole,
    recentMessages: input.recentMessages,
    pendingDetection: input.pendingDetection,
    childrenNames,
  });

  // LOG DIAGNÓSTICO: visible en Vercel logs para diagnosticar por qué Nanny
  // queda muda en casos manuales. Captura input + decisión del classifier.
  console.log('[pipeline] classifier', {
    message: input.message.slice(0, 80),
    intent: classification.intent,
    is_actionable: classification.is_actionable,
    is_direct_to_nanny: classification.is_direct_to_nanny,
    should_respond: classification.should_respond,
    silent_action: classification.silent_action,
    references_previous: classification.references_previous,
    complexity: classification.complexity,
    detected_items_count: classification.detected_items_count,
    hasPending: !!input.pendingDetection,
  });

  if (classification.intent === 'CORRECTION') {
    persistCorrectionIfGeneral(openai, input.message, input.senderName, senderRole)
      .catch(err => console.warn('[pipeline] correction distill error:', err));
  }

  // Red de seguridad: si hay pending_detection activa y el classifier marcó
  // el mensaje como NO accionable, lo forzamos a procesar igual cuando es una
  // respuesta corta (≤25 chars). Esto cubre casos donde gpt-4o-mini se confunde
  // con respuestas telegráficas tipo "yo", "no puedo", "a las 5", "papá" — que
  // claramente son completion del pending pero que el classifier no asocia.
  // El extractor decide si realmente completa el pending o lo abandona.
  if (
    input.pendingDetection &&
    !classification.is_actionable &&
    input.message.trim().length <= 25
  ) {
    console.warn('[pipeline] forzando is_actionable=true por pending activo y respuesta corta', {
      message: input.message,
      pendingType: (input.pendingDetection as { type?: string }).type,
    });
    classification.is_actionable = true;
    classification.references_previous = true;
    classification.silent_action = false; // queremos que Nanny CONFIRME la acción
  }

  // ═══════════════════════════════════════
  // DECISIÓN TEMPRANA: ¿Va a haber respuesta?
  // ═══════════════════════════════════════
  const willRespond = await computeWillRespond(classification, input);
  yield { type: 'will_respond', value: willRespond };

  if (!willRespond) {
    yield { type: 'response', response: silentResponse(classification.intent) };
    return;
  }

  // ═══════════════════════════════════════
  // PASO 2: Generar respuesta
  // ═══════════════════════════════════════
  const response = await runResponse(openai, input, classification, senderRole, currentDate);
  yield { type: 'response', response };
}

/**
 * Pipeline no-streaming (compatibilidad con eval offline + chat-catchup).
 * Acumula los eventos del stream y devuelve solo el response final.
 */
export async function processChatPipeline(input: ChatInput): Promise<ChatResponse> {
  let final: ChatResponse | null = null;
  for await (const evt of processChatPipelineStream(input)) {
    if (evt.type === 'response') final = evt.response;
  }
  return final || silentResponse('CHAT');
}

/**
 * Decide ANTES de correr extractor/responder si Nanny va a producir un reply.
 * Esto se usa para emitir `will_respond` temprano vía SSE.
 *
 * Reglas (de menor a mayor prioridad):
 *  - is_direct_to_nanny / question / concern / correction / greeting → SI
 *  - is_actionable → SI (siempre devolvemos receipt — buffered receipt model)
 *  - can_add_value (proactiva) → solo si está dentro de ventana 7-22h y no
 *    se excedió la cuota diaria de proactivas
 *  - resto → NO
 */
async function computeWillRespond(classification: ClassifierOutput, input: ChatInput): Promise<boolean> {
  if (classification.is_direct_to_nanny) return true;
  if (classification.is_question_nanny_can_answer) return true;
  if (classification.intent === 'CONCERN') return true;
  if (classification.intent === 'CORRECTION') return true;
  if (classification.intent === 'GREETING') return true;
  if (classification.intent === 'DIRECT_QUESTION') return true;

  // Actionable → buffered receipt (siempre acuse de recibo)
  if (classification.is_actionable) return true;

  // Proactiva pura: chequear ventana + cuota
  if (classification.can_add_value || classification.should_respond) {
    if (!isInActiveWindow()) return false;
    const todays = await countTodaysProactive(input.familyId);
    if (todays >= PROACTIVE_DAILY_LIMIT) return false;
    return true;
  }

  return false;
}

/**
 * Ejecuta extractor y/o responder según el clasificador. Asume que ya se
 * decidió que SÍ habrá respuesta.
 */
async function runResponse(
  openai: OpenAI,
  input: ChatInput,
  classification: ClassifierOutput,
  senderRole: 'mama' | 'papa',
  currentDate: string,
): Promise<ChatResponse> {
  // Determinar tipo de respuesta para el responder
  let responseType: 'greeting' | 'direct_question' | 'answerable_question' | 'concern' | 'correction' | 'proactive';
  if (classification.intent === 'GREETING') responseType = 'greeting';
  else if (classification.intent === 'CONCERN') responseType = 'concern';
  else if (classification.intent === 'CORRECTION') responseType = 'correction';
  else if (classification.is_direct_to_nanny) responseType = 'direct_question';
  else if (classification.is_question_nanny_can_answer) responseType = 'answerable_question';
  else responseType = 'proactive';

  // Si es accionable → extractor (incluso para silent_action: producimos
  // receipt mínimo, no silencio total).
  if (classification.is_actionable) {
    const r = await runExtraction(openai, input, classification, senderRole, currentDate);
    // Safety net: si el extractor devolvió reply vacío pero hay confirmation o
    // pending_detection, sintetizamos el texto. La pregunta DEBE aparecer como
    // mensaje del chat — nunca como popup ni banner. El chat es el único canal
    // de input/output con los padres (regla de producto).
    if (!r.reply.trim()) {
      r.reply = synthesizeReceipt(r) || synthesizeQuestion(r.pending_detection);
      r.should_respond = r.reply.length > 0;
    }
    return { ...r, is_proactive: responseType === 'proactive' };
  }

  // No accionable → responder genera mensaje contextual
  const directResponse = await generateDirectResponse(openai, {
    message: input.message,
    senderName: input.senderName,
    senderRole,
    familyContext: input.familyContext,
    recentMessages: input.recentMessages,
    existingEvents: input.existingEvents,
    existingTasks: input.existingTasks,
    activeMedications: input.activeMedications,
    currentDate,
    type: responseType,
  });

  const trimmed = directResponse.reply.trim();
  return {
    should_respond: trimmed.length > 0,
    reply: trimmed,
    intent: classification.intent,
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
    is_proactive: responseType === 'proactive',
  };
}

/**
 * Genera un receipt textual mínimo a partir de las confirmations del
 * extractor. Solo se usa como safety net cuando el extractor entrega un reply
 * vacío.
 */
function synthesizeReceipt(r: ChatResponse): string {
  const items: string[] = [];
  if (r.confirmation) items.push(receiptForConfirmation(r.confirmation));
  for (const c of r.additional_confirmations || []) {
    items.push(receiptForConfirmation(c));
  }
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return 'Anotado. ' + items.join(' ');
}

function receiptForConfirmation(c: { type: string; data: Record<string, unknown> }): string {
  if (c.type === 'task') return `Tarea creada: ${(c.data.title as string) || 'item'}.`;
  if (c.type === 'event') return `Evento creado: ${(c.data.title as string) || 'item'}.`;
  if (c.type === 'medication') return `Tratamiento registrado: ${(c.data.medication_name as string) || 'tratamiento'}.`;
  if (c.type === 'routine') {
    const name = (c.data.name as string) || 'Rutina';
    const childName = (c.data.child_name as string) || '';
    const days = Array.isArray(c.data.days_of_week) ? c.data.days_of_week as number[] : [];
    const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const daysLabel = days.length === 5 && days.every(d => d >= 1 && d <= 5)
      ? 'lun a vie'
      : days.map(d => dayNames[d]).filter(Boolean).join(', ');
    const timeStart = (c.data.time_start as string | undefined) || '';
    const timeEnd = c.data.time_end as string | undefined;
    const timeLabel = timeEnd ? `${timeStart}–${timeEnd}` : timeStart;
    const parts = [name, childName ? `de ${childName}` : '', daysLabel, timeLabel].filter(Boolean);
    return `Rutina registrada: ${parts.join(' ')}.`;
  }
  if (c.type === 'routine_exception') return 'Día cancelado.';
  return `Anotado.`;
}

/**
 * Sintetiza la pregunta cuando el extractor invocó ask_for_missing_info pero no
 * generó texto. La pregunta debe ser CORTA y aparecer en el chat — nunca como
 * popup. Prioridad: asignación > horario > fecha > ubicación.
 */
function synthesizeQuestion(pending: ChatResponse['pending_detection']): string {
  if (!pending) return '';
  const missing = pending.missing.map(x => x.toLowerCase());
  const has = (k: string) => missing.some(m => m.includes(k));
  if (has('assigned') || has('quien') || has('responsable') || has('dueño')) {
    return '¿Quién lo lleva?';
  }
  if (has('time') || has('hora')) return '¿A qué hora?';
  if (has('date') || has('fecha') || has('day') || has('dia')) return '¿Qué día?';
  if (has('location') || has('lugar') || has('ubicación')) return '¿Dónde es?';
  if (has('name') || has('nombre')) return '¿Cómo se llama?';
  if (has('frequency') || has('frecuencia')) return '¿Cada cuánto?';
  return pending.summary || 'Necesito un dato más para registrarlo.';
}

/**
 * Ejecuta la extracción + post-proceso.
 */
async function runExtraction(
  openai: OpenAI,
  input: ChatInput,
  classification: ClassifierOutput,
  senderRole: 'mama' | 'papa',
  currentDate: string,
): Promise<ChatResponse> {
  // Pipeline híbrido: classifier y responder siguen en gpt-4o-mini (tareas
  // simples, baratas, mini las hace OK), pero el EXTRACTOR siempre usa gpt-4o.
  // El extractor es el cerebro: detecta múltiples tools en paralelo, infiere
  // assigned_to del contexto histórico, decide entre create_X y
  // ask_for_missing_info, captura rutinas complejas. Mini fallaba sistemáticamente
  // en estos casos y nos forzaba a meter redes de seguridad determinísticas
  // (routine-detector regex, fallback de "respuesta corta con pending", etc.).
  // Costo estimado: +$0.40/familia/mes (de ~$0.14 a ~$0.55).
  const model = 'gpt-4o';

  const extracted = await extractData(openai, {
    message: input.message,
    senderName: input.senderName,
    senderRole,
    intent: classification.intent,
    complexity: classification.complexity,
    familyContext: input.familyContext,
    recentMessages: input.recentMessages,
    existingEvents: input.existingEvents,
    existingTasks: input.existingTasks,
    activeMedications: input.activeMedications,
    existingRoutines: input.existingRoutines || '',
    pendingDetection: input.pendingDetection,
    currentDate,
  }, model);

  const rawResponse: ChatResponse = {
    should_respond: true,
    reply: extracted.reply,
    intent: extracted.intent || classification.intent,
    next_action: extracted.next_action || 'stay_silent',
    child: extracted.child || null,
    confirmation: extracted.confirmation || null,
    additional_confirmations: extracted.additional_confirmations || [],
    pending_detection: extracted.pending_detection || null,
    task_group: extracted.task_group || null,
  };

  // Red de seguridad: si el mensaje describe inequívocamente una rutina semanal
  // y el extractor LLM no la creó, la inyectamos determinísticamente. Esto evita
  // que clasificaciones erróneas (SCHEDULE_CHANGE, LOGISTICS_PICKUP, etc.) hagan
  // que Nanny conteste "Anotado" sin registrar nada.
  const alreadyHasRoutine = rawResponse.confirmation?.type === 'routine' ||
    (rawResponse.additional_confirmations || []).some(c => c.type === 'routine');
  if (!alreadyHasRoutine) {
    // Preferimos los nombres pasados explícitamente desde el cliente (más
    // confiables); caemos al parser de familyContext solo si no llegaron.
    const childrenNames = (input.childrenNames && input.childrenNames.length > 0)
      ? input.childrenNames
      : getChildrenNames(input.familyContext);
    const detected = detectRoutineInMessage(input.message, childrenNames);
    if (detected) {
      const routineConf = {
        type: 'routine',
        data: {
          child_name: detected.child_name,
          name: detected.name,
          type: detected.type,
          days_of_week: detected.days_of_week,
          time_start: detected.time_start,
          time_end: detected.time_end,
        },
      };
      // Si el extractor ya tenía otra confirmation (ej event mal clasificado),
      // la mantenemos como additional para no perder info, pero la rutina toma
      // el slot principal.
      const existingConfs = [
        ...(rawResponse.confirmation ? [rawResponse.confirmation] : []),
        ...(rawResponse.additional_confirmations || []),
      ];
      rawResponse.confirmation = routineConf;
      rawResponse.additional_confirmations = existingConfs;
      // intent='ROUTINE' lo seta el bloque de abajo (común a LLM y detector).
      rawResponse.next_action = 'confirm_routine';
      rawResponse.pending_detection = null;
      // Receipt explícito reemplazando el "Anotado" genérico
      const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
      const daysLabel = detected.days_of_week.length === 5 &&
        detected.days_of_week.every(d => d >= 1 && d <= 5)
        ? 'lun a vie'
        : detected.days_of_week.map(d => dayNames[d]).join(', ');
      const timeLabel = detected.time_end
        ? `${detected.time_start}–${detected.time_end}`
        : detected.time_start;
      rawResponse.reply = `Rutina registrada: ${detected.name} de ${detected.child_name}, ${daysLabel} ${timeLabel}.`;
    }
  }

  // Si la confirmation principal es una rutina (sea del LLM o del detector),
  // normalizamos el intent a 'ROUTINE' para que el badge del cliente muestre el
  // card correcto ("Rutina creada") y navegue al perfil del hijo, en vez de
  // mostrar el badge genérico EVENT_ACTIVITY que dice "Actividad / Ver evento".
  if (rawResponse.confirmation?.type === 'routine') {
    rawResponse.intent = 'ROUTINE';
  }

  // LOG DIAGNÓSTICO: salida cruda del extractor antes del postprocess.
  console.log('[pipeline] extractor', {
    reply_preview: (rawResponse.reply || '').slice(0, 80),
    reply_empty: !rawResponse.reply.trim(),
    next_action: rawResponse.next_action,
    confirmation_type: rawResponse.confirmation?.type || null,
    additional_count: (rawResponse.additional_confirmations || []).length,
    has_pending: !!rawResponse.pending_detection,
    pending_missing: rawResponse.pending_detection?.missing || null,
  });

  return postProcessResponse({
    response: rawResponse,
    senderRole,
    existingEvents: input.existingEvents,
    existingTasks: input.existingTasks,
    activeMedications: input.activeMedications,
  });
}

export { getActivePromptContent };
