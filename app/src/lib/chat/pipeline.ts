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
import { classifyMessage } from './classifier';
import { extractData } from './extractor';
import { generateDirectResponse } from './responder';
import { postProcessResponse } from './postprocess';
import { persistCorrectionIfGeneral } from './correction-rules';
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
  // Preferir el rol explícito del frontend (viene de parent.role en la DB)
  if (input.senderRole) return input.senderRole;

  // Fallback: inferir del familyContext
  const mamaMatch = input.familyContext.match(/(\w+)\s*\(👩\)/);
  const papaMatch = input.familyContext.match(/(\w+)\s*\(👨\)/);
  const senderLower = input.senderName.toLowerCase();

  if (mamaMatch && senderLower.includes(mamaMatch[1].toLowerCase())) return 'mama';
  if (papaMatch && senderLower.includes(papaMatch[1].toLowerCase())) return 'papa';

  return 'mama';
}

/**
 * Extrae los nombres de los hijos del familyContext.
 */
function getChildrenNames(familyContext: string): string[] {
  const matches = familyContext.matchAll(/(\w+)\s*\((?:👧|👦|👶)/g);
  return Array.from(matches).map(m => m[1]);
}

/**
 * Carga el prompt activo de la DB para el extractor (si existe).
 */
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
 * Pipeline principal de Nanny.
 */
export async function processChatPipeline(input: ChatInput): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada en el servidor.');
  }

  const openai = new OpenAI({ apiKey });
  const senderRole = getSenderRole(input);
  const childrenNames = getChildrenNames(input.familyContext);

  const now = new Date();
  const currentDate = now.toISOString().split('T')[0] + ' (' + now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ') ' + now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

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

  // Si es una corrección, intentamos destilar una regla general en background
  // (no bloqueamos la respuesta; el destilador es best-effort).
  if (classification.intent === 'CORRECTION') {
    persistCorrectionIfGeneral(openai, input.message, input.senderName, senderRole)
      .catch(err => console.warn('[pipeline] correction distill error:', err));
  }

  // ═══════════════════════════════════════
  // PASO 2a: SILENT ACTION
  // ═══════════════════════════════════════
  // Padres cerraron loop entre ellos y solo necesitamos registrar.
  // Corremos el extractor pero descartamos el reply: el sistema persiste
  // el evento/tarea, Nanny no habla. Excepciones que invalidan el silencio:
  //  - intent médico (siempre confirma)
  //  - mensaje dirigido a Nanny
  //  - corrección o concern
  //  - chequeo de cuotas anti-spam (no aplica acá; silent no consume cuota)
  const isMedical =
    classification.intent === 'EVENT_MEDICAL' || classification.intent === 'MEDICATION';
  const blocksSilent =
    isMedical ||
    classification.is_direct_to_nanny ||
    classification.intent === 'CONCERN' ||
    classification.intent === 'CORRECTION';

  if (classification.silent_action && classification.is_actionable && !blocksSilent) {
    const extractedResponse = await runExtraction(openai, input, classification, senderRole, currentDate);
    return {
      ...extractedResponse,
      should_respond: false,
      reply: '',
    };
  }

  // ═══════════════════════════════════════
  // PASO 2b: Respuestas directas (un solo reply por turno)
  // ═══════════════════════════════════════
  const needsDirectResponse =
    classification.should_respond ||
    classification.is_direct_to_nanny ||
    classification.is_question_nanny_can_answer ||
    classification.intent === 'CONCERN' ||
    classification.intent === 'CORRECTION' ||
    classification.intent === 'GREETING' ||
    classification.intent === 'DIRECT_QUESTION' ||
    classification.can_add_value;

  if (needsDirectResponse) {
    let responseType: 'greeting' | 'direct_question' | 'answerable_question' | 'concern' | 'correction' | 'proactive';

    if (classification.intent === 'GREETING') {
      responseType = 'greeting';
    } else if (classification.intent === 'CONCERN') {
      responseType = 'concern';
    } else if (classification.intent === 'CORRECTION') {
      responseType = 'correction';
    } else if (classification.is_direct_to_nanny) {
      responseType = 'direct_question';
    } else if (classification.is_question_nanny_can_answer) {
      responseType = 'answerable_question';
    } else {
      responseType = 'proactive';
    }

    // Anti-spam: si la respuesta es proactiva (Nanny habla sin que le
    // pregunten), respetamos límite diario y ventana 7am-10pm. Las
    // respuestas a preguntas directas, correcciones y concerns NO consumen
    // cuota — son contestaciones directas al padre.
    if (responseType === 'proactive') {
      if (!isInActiveWindow()) {
        return silentResponse(classification.intent);
      }
      const todaysProactive = await countTodaysProactive(input.familyId);
      if (todaysProactive >= PROACTIVE_DAILY_LIMIT) {
        return silentResponse(classification.intent);
      }
    }

    // Si es accionable Y necesita respuesta directa, el extractor produce
    // el reply (ya que el JSON del extractor incluye reply contextual).
    // El responder se reserva para casos NO accionables.
    if (classification.is_actionable) {
      const r = await runExtraction(openai, input, classification, senderRole, currentDate);
      return { ...r, is_proactive: responseType === 'proactive' };
    }

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

  // ═══════════════════════════════════════
  // PASO 2c: No accionable → silencio
  // ═══════════════════════════════════════
  if (!classification.is_actionable) {
    return {
      should_respond: false,
      reply: '',
      intent: classification.intent,
      next_action: 'stay_silent',
      child: null,
      confirmation: null,
      additional_confirmations: [],
      pending_detection: null,
    };
  }

  // ═══════════════════════════════════════
  // PASO 2d: Accionable sin respuesta directa → Extraer
  // ═══════════════════════════════════════
  return runExtraction(openai, input, classification, senderRole, currentDate);
}

/**
 * Ejecuta la extracción + post-proceso.
 */
async function runExtraction(
  openai: OpenAI,
  input: ChatInput,
  classification: Awaited<ReturnType<typeof classifyMessage>>,
  senderRole: 'mama' | 'papa',
  currentDate: string
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
    pendingDetection: input.pendingDetection,
    currentDate,
  }, model);

  // ═══════════════════════════════════════
  // PASO 3: Post-proceso
  // ═══════════════════════════════════════
  const rawResponse: ChatResponse = {
    should_respond: true,
    reply: extracted.reply,
    intent: extracted.intent || classification.intent,
    next_action: extracted.next_action || 'stay_silent',
    child: extracted.child || null,
    confirmation: extracted.confirmation || null,
    additional_confirmations: extracted.additional_confirmations || [],
    pending_detection: extracted.pending_detection || null,
  };

  const postProcessed = postProcessResponse({
    response: rawResponse,
    senderRole,
    existingEvents: input.existingEvents,
    existingTasks: input.existingTasks,
    activeMedications: input.activeMedications,
  });

  return postProcessed;
}

export { getActivePromptContent };
