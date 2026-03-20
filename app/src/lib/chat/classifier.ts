/**
 * Paso 1 del pipeline: Clasificar el mensaje.
 * Usa gpt-4o-mini con un prompt pequeño y enfocado.
 *
 * Decide: ¿es accionable? ¿qué tipo? ¿debo responder? ¿es para Nanny?
 */

import OpenAI from 'openai';

export interface ClassifierInput {
  message: string;
  senderName: string;
  recentMessages: string;
  pendingDetection: Record<string, unknown> | null;
  childrenNames: string[];
}

export interface ClassifierOutput {
  is_actionable: boolean;
  intent: string;
  should_respond: boolean;
  is_direct_to_nanny: boolean;
  is_question_nanny_can_answer: boolean;
  complexity: 'simple' | 'ambiguous' | 'complex';
  detected_items_count: number;
  summary: string;
}

const CLASSIFIER_PROMPT = `Eres un clasificador de mensajes para una app de coordinación familiar. Los padres hablan ENTRE ELLOS en un chat grupal y tú escuchas.

Tu ÚNICO trabajo es clasificar cada mensaje. NO extraigas datos, NO generes respuestas.

CONTEXTO:
- Quien escribe: {sender_name}
- Hijos: {children_names}
- Mensajes recientes: {recent_messages}
- Detección pendiente: {pending_detection}

REGLAS DE CLASIFICACIÓN:

1. is_actionable = true si el mensaje contiene:
   - Un evento con fecha/hora/lugar
   - Una tarea concreta (comprar, pagar, buscar, llevar, recoger)
   - Info médica (cita, medicamento, síntomas)
   - Delegación de responsabilidad ("yo lo hago", "tú encárgate")
   - Confirmación/complemento de una detección pendiente ("ok", "dale", "a las 3", etc.)
   - Cambio de plan sobre algo ya mencionado

2. is_actionable = false si el mensaje es:
   - Solo cariño/emojis sin info ("te amo", "❤️", "besos")
   - Conversación casual sin acción ("cómo dormiste?", "bien gracias")
   - Queja/desahogo sin info logística ("siempre me toca a mí" sin evento concreto)
   - "ok"/"dale" sin detección pendiente activa

3. is_direct_to_nanny = true si:
   - Mencionan "Nanny" por nombre
   - Le hacen una pregunta directa ("Nanny, ¿cuándo es...?")
   - Le dan una instrucción ("Nanny anota...")

4. is_question_nanny_can_answer = true si:
   - Un padre pregunta algo al otro Y la respuesta está en los MENSAJES RECIENTES
   - Ejemplo: "¿A qué hora era la cita?" y en mensajes recientes ya se dijo "pediatra a las 10"
   - SOLO si la info está CLARAMENTE en el contexto reciente

5. complexity:
   - "simple": Un solo tema claro con datos completos
   - "ambiguous": Falta info, mezcla temas, abreviaciones, spanglish
   - "complex": Múltiples temas en un mensaje, info distribuida, cambios de plan

6. detected_items_count: cuántos ítems accionables DISTINTOS hay en el mensaje (0, 1, 2, 3...)

7. intent (uno principal): EVENT_SCHOOL|EVENT_ACTIVITY|EVENT_MEDICAL|TASK_SHOPPING|TASK_PAYMENT|MEDICATION|LOGISTICS_PICKUP|LOGISTICS_TRANSPORT|SCHEDULE_CHANGE|MILESTONE|SUPPLY_LOW|HEALTH_LOG|DIRECT_QUESTION|GREETING|CHAT|IGNORE

Responde SOLO JSON puro:
{
  "is_actionable": boolean,
  "intent": "string",
  "should_respond": boolean,
  "is_direct_to_nanny": boolean,
  "is_question_nanny_can_answer": boolean,
  "complexity": "simple|ambiguous|complex",
  "detected_items_count": number,
  "summary": "resumen en 10 palabras max de lo que contiene el mensaje"
}`;

export async function classifyMessage(
  openai: OpenAI,
  input: ClassifierInput
): Promise<ClassifierOutput> {
  const pendingStr = input.pendingDetection
    ? `ACTIVA: ${JSON.stringify(input.pendingDetection)}`
    : 'Ninguna';

  const prompt = CLASSIFIER_PROMPT
    .replace('{sender_name}', input.senderName)
    .replace('{children_names}', input.childrenNames.join(', ') || 'No especificados')
    .replace('{recent_messages}', input.recentMessages || 'Ninguno')
    .replace('{pending_detection}', pendingStr);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    temperature: 0.1,
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
    // Fallback: asumir accionable para no perder detecciones
    return {
      is_actionable: true,
      intent: 'CHAT',
      should_respond: true,
      is_direct_to_nanny: false,
      is_question_nanny_can_answer: false,
      complexity: 'ambiguous',
      detected_items_count: 0,
      summary: 'No se pudo clasificar',
    };
  }
}
