/**
 * Pipeline de Nanny: orquesta classify → extract → postprocess.
 *
 * Flujo:
 * 1. Classifier (mini): ¿Es accionable? ¿Qué tipo? ¿Para Nanny? ¿Puede aportar valor?
 * 2a. Si es saludo/pregunta directa/concern/proactive → Responder (mini)
 * 2b. Si es accionable → Extractor (mini o gpt-4o según complejidad)
 * 3. Post-proceso: fix assigned_to, validar FPs
 *
 * Costo ~2 llamadas a mini por mensaje accionable (~$0.14/mes/familia)
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

  if (classification.intent === 'CORRECTION') {
    persistCorrectionIfGeneral(openai, input.message, input.senderName, senderRole)
      .catch(err => console.warn('[pipeline] correction distill error:', err));
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
    // Safety net: si el extractor devolvió reply vacío pero hay confirmation,
    // sintetizamos un receipt mínimo. Nunca prometemos respuesta y mostramos
    // nada — eso rompería la confianza del cliente sobre will_respond.
    if (!r.reply.trim()) {
      r.reply = synthesizeReceipt(r);
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
  const title = (c.data.title as string) || (c.data.medication_name as string) || 'item';
  if (c.type === 'task') return `Tarea creada: ${title}.`;
  if (c.type === 'event') return `Evento creado: ${title}.`;
  if (c.type === 'medication') return `Tratamiento registrado: ${title}.`;
  return `Anotado: ${title}.`;
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
  const model = classification.complexity === 'complex' ? 'gpt-4o' : 'gpt-4o-mini';

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
      rawResponse.intent = 'EVENT_SCHOOL'; // El badge usa intent; school encaja para guarde/cole
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

  return postProcessResponse({
    response: rawResponse,
    senderRole,
    existingEvents: input.existingEvents,
    existingTasks: input.existingTasks,
    activeMedications: input.activeMedications,
  });
}

export { getActivePromptContent };
