/**
 * Paso 2 del pipeline: Extraer datos estructurados.
 * Solo se ejecuta si el classifier dice que el mensaje es accionable.
 * Prompt enfocado SOLO en extracción, no en decidir si responder.
 */

import OpenAI from 'openai';

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

2. FECHAS: Calcula desde {current_date}.
   - "mañana" = día siguiente
   - "el lunes" = próximo lunes
   - Si no dicen hora, usa defaults: médico 10:00, escolar 08:00, actividad 16:00
   - Si HAY hora explícita, úsala

3. PENDING DETECTION: Si hay una activa y el mensaje la complementa, COMPLÉTALA como confirmation.
   - "ok/sí/dale" con pending activa → confirmation con datos del pending
   - Info nueva (hora, quién) → incorporar al pending y emitir confirmation si está completo

4. MÚLTIPLES DETECCIONES: Si hay varios ítems accionables:
   - Emite el MÁS COMPLETO como confirmation
   - Los demás van en pending_detection

5. NO DUPLICAR: Si ya existe en EVENTOS/TAREAS/MEDICAMENTOS, no crees confirmation. Ofrece actualizar.

6. FALSOS POSITIVOS — NO crees confirmation para:
   - Síntomas sin tratamiento (fiebre, tos) → intent=HEALTH_LOG, confirmation=null
   - Preguntas que piden info
   - Preocupaciones sin acción concreta
   - Info que ya está registrada

7. REPLY: Máximo 3 oraciones. Confirma lo detectado + pregunta SOLO datos faltantes.

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

  const prompt = EXTRACTOR_PROMPT
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
    return JSON.parse(clean);
  } catch {
    return {
      reply: content,
      intent: input.intent,
      next_action: 'stay_silent',
      child: null,
      confirmation: null,
      pending_detection: null,
    };
  }
}
