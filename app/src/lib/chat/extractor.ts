/**
 * Paso 2 del pipeline: Extraer datos estructurados.
 * Solo se ejecuta si el classifier dice que el mensaje es accionable.
 * Prompt enfocado SOLO en extracción, no en decidir si responder.
 */

import OpenAI from 'openai';
import { buildRulesText } from './prompt-rules';

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
}

const EXTRACTOR_PROMPT = `Eres Nanny, asistente de coordinación familiar. Tu trabajo es EXTRAER datos estructurados del mensaje.

QUIÉN ESCRIBE: {sender_name} (es {sender_role})
FECHA ACTUAL: {current_date}
INTENT DETECTADO: {intent}

CONTEXTO FAMILIAR:
{family_context}

EVENTOS AGENDADOS: {existing_events}
TAREAS PENDIENTES: {existing_tasks}
MEDICAMENTOS ACTIVOS: {active_medications}

MENSAJES RECIENTES:
{recent_messages}

DETECCIÓN PENDIENTE:
{pending_detection}

═══════════════════════════════════════
REGLAS DE EXTRACCIÓN:
═══════════════════════════════════════

1. ASSIGNED_TO: Usa "mama" o "papa" (literal). {sender_name} es {sender_role}.
   - "yo lo hago/llevo/recojo/compro" → assigned_to = "{sender_role}"
   - "tú encárgate/pasa por" → assigned_to = el OTRO rol
   - "ok/dale/va" aceptando una solicitud → assigned_to = "{sender_role}"
   - NUNCA uses el nombre del padre, SIEMPRE "mama" o "papa"
   - PATRÓN HISTÓRICO: Si en EVENTOS/TAREAS existentes ves que un padre SIEMPRE se encarga de cierto tipo de tarea (ej: "mama" siempre lleva al doctor, "papa" siempre recoge del cole), INFIERE el assigned_to basándote en ese patrón cuando no sea explícito. Menciona tu inferencia: "Como siempre lo llevas tú, te lo asigné."

2. FECHAS: Calcula desde {current_date}.
   - "mañana" = día siguiente
   - "el lunes" = próximo lunes (si hoy es lunes, el próximo)
   - "este viernes" = el viernes de esta semana
   - Si no dicen hora, usa defaults: médico 10:00, escolar 08:00, actividad 16:00
   - Si HAY hora explícita, úsala

3. COMPRENSIÓN CONVERSACIONAL — Lee los MENSAJES RECIENTES como un HILO continuo:
   - "sí", "dale", "ok", "va", "perfecto" → busca en mensajes anteriores QUÉ están confirmando
   - "a las 3" sin más contexto → busca en mensajes recientes de qué evento/tarea hablan
   - "llévalo tú" → identifica el TEMA de la conversación reciente para saber QUÉ llevar
   - "yo no puedo" → complementa con el contexto: ¿no puede QUÉ?
   - Si hay pending_detection activa, prioriza completarla con la nueva info

4. PENDING DETECTION: Si hay una activa y el mensaje la complementa, COMPLÉTALA como confirmation.
   - "ok/sí/dale" con pending activa → confirmation con datos del pending + cualquier dato nuevo
   - Info nueva (hora, quién) → incorporar al pending y emitir confirmation si está completo

5. MÚLTIPLES DETECCIONES: Si hay varios ítems accionables:
   - Emite el MÁS COMPLETO como confirmation
   - Los demás como additional_confirmations si tienen datos suficientes, o pending_detection si no

6. NO DUPLICAR: Si ya existe en EVENTOS/TAREAS/MEDICAMENTOS, no crees confirmation. Ofrece actualizar.

7. FALSOS POSITIVOS — NO crees confirmation para:
   - Síntomas sin tratamiento (fiebre, tos) → intent=HEALTH_LOG, confirmation=null
   - Preguntas que piden info
   - Preocupaciones sin acción concreta
   - Info que ya está registrada

8. REPLY: Máximo 3 oraciones. Tono cálido pero directo, como nanny profesional latina. Confirma lo detectado + pregunta SOLO datos faltantes CRÍTICOS.

9. TAREAS Y COMPRAS: Crea la tarea INMEDIATAMENTE con confirmation, incluso sin assigned_to (déjalo null). NO uses pending_detection para tareas.
   Si el mensaje contiene VARIAS tareas/compras, pon la primera en "confirmation" y las demás en "additional_confirmations".

FORMATO DE RESPUESTA (solo JSON puro):
{
  "reply": "mensaje de Nanny",
  "intent": "INTENT_TYPE",
  "next_action": "confirm_event|confirm_task|confirm_medication|ask_for_missing_time|ask_for_missing_responsible_parent|update_existing_event|update_existing_task|offer_reminders|stay_silent",
  "child": "nombre o null",
  "confirmation": null o {
    "type": "event|task|medication",
    "data": {
      // event: title, event_type (doctor|school|birthday|activity|travel|other), date_start (ISO), date_description, location, assigned_to
      // task: title, assigned_to, due_date
      // medication: medication_name, duration_days, start_date, end_date, frequency, schedule_times
    }
  },
  "additional_confirmations": [],
  "pending_detection": null o {
    "type": "event|task|medication",
    "partial_data": {},
    "missing": [],
    "summary": "breve"
  }
}`;

export async function extractData(
  openai: OpenAI,
  input: ExtractorInput,
  model: string = 'gpt-4o-mini'
): Promise<ExtractorOutput> {
  const pendingStr = input.pendingDetection
    ? `ACTIVA: ${JSON.stringify(input.pendingDetection)}\nSi el mensaje complementa esta detección, COMPLÉTALA.`
    : 'Ninguna';

  const extraRules = buildRulesText('extractor');
  const prompt = (EXTRACTOR_PROMPT + extraRules)
    .replace(/{sender_name}/g, input.senderName)
    .replace(/{sender_role}/g, input.senderRole)
    .replace('{current_date}', input.currentDate)
    .replace('{intent}', input.intent)
    .replace('{family_context}', input.familyContext)
    .replace('{existing_events}', input.existingEvents || 'Ninguno')
    .replace('{existing_tasks}', input.existingTasks || 'Ninguna')
    .replace('{active_medications}', input.activeMedications || 'Ninguno')
    .replace('{recent_messages}', input.recentMessages || 'Ninguno')
    .replace('{pending_detection}', pendingStr);

  const response = await openai.chat.completions.create({
    model,
    max_tokens: 700,
    temperature: 0.3,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input.message },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || '';

  try {
    let clean = content;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(clean);
    return {
      ...parsed,
      additional_confirmations: Array.isArray(parsed.additional_confirmations) ? parsed.additional_confirmations : [],
    };
  } catch {
    return {
      reply: content,
      intent: input.intent,
      next_action: 'stay_silent',
      child: null,
      confirmation: null,
      additional_confirmations: [],
      pending_detection: null,
    };
  }
}
