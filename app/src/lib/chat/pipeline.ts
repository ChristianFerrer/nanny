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
import type { ChatInput, ChatResponse } from './processChat';
import { getSupabaseAdmin } from '@/lib/supabase';

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

  // ═══════════════════════════════════════
  // PASO 2a: Respuestas directas
  // ═══════════════════════════════════════
  // Determine response type — now handles CONCERN and proactive
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

    // If also actionable, continue with extraction and combine
    if (!classification.is_actionable) {
      return {
        should_respond: true,
        reply: directResponse.reply,
        intent: classification.intent,
        next_action: 'stay_silent',
        child: null,
        confirmation: null,
        additional_confirmations: [],
        pending_detection: null,
      };
    }

    // Actionable AND has direct response: extract AND respond
    const extractedResponse = await runExtraction(openai, input, classification, senderRole, currentDate);
    extractedResponse.reply = directResponse.reply + '\n\n' + extractedResponse.reply;
    return extractedResponse;
  }

  // ═══════════════════════════════════════
  // PASO 2b: No accionable → silencio
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
  // PASO 2c: Accionable → Extraer
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
