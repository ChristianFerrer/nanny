/**
 * Paso 1 del pipeline: Clasificar el mensaje.
 * Usa gpt-4o-mini con un prompt pequeño y enfocado.
 *
 * Decide: ¿es accionable? ¿qué tipo? ¿debo responder? ¿es para Nanny?
 */

import OpenAI from 'openai';
import { buildRulesText } from './prompt-rules';

export interface ClassifierInput {
  message: string;
  senderName: string;
  senderRole: 'mama' | 'papa';
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
  can_add_value: boolean;
  references_previous: boolean;
  complexity: 'simple' | 'ambiguous' | 'complex';
  detected_items_count: number;
  summary: string;
}

const CLASSIFIER_PROMPT = `Eres un clasificador de mensajes para una app de coordinación familiar. Los padres hablan ENTRE ELLOS en un chat grupal y tú (Nanny) escuchas.

Tu ÚNICO trabajo es clasificar cada mensaje. NO extraigas datos, NO generes respuestas.

CONTEXTO:
- Quien escribe: {sender_name} (es {sender_role})
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
   - Piden información que SOLO Nanny puede dar: resúmenes ("dame un resumen"), consultas de agenda ("qué tenemos hoy?", "qué hay esta semana?"), estado de tareas ("qué falta por hacer?")
   - Comandos implícitos dirigidos al asistente: "anota esto", "recuérdame", "registra que..."
   - En este chat solo hay 2 padres y Nanny. Si el mensaje NO es claramente para el otro padre, probablemente es para Nanny.

4. is_question_nanny_can_answer = true si:
   - Un padre pregunta algo al otro Y la respuesta está en los MENSAJES RECIENTES, EVENTOS, TAREAS o MEDICAMENTOS conocidos
   - Ejemplo: "¿A qué hora era la cita?" y en mensajes recientes ya se dijo "pediatra a las 10"
   - SOLO si la info está CLARAMENTE en el contexto

5. can_add_value = true si Nanny puede aportar información ÚTIL aunque nadie le pregunte:
   - Detecta un CONFLICTO DE HORARIO ("fútbol y dentista están el mismo día")
   - Un padre no sabe algo que ya se mencionó en la conversación
   - Hay un recordatorio relevante próximo (evento hoy/mañana no mencionado)
   - Un padre expresa PREOCUPACIÓN o DUDA sobre salud/logística y Nanny tiene datos registrados
   - Un padre pregunta algo genérico ("qué hacemos hoy?") y hay eventos agendados
   - EXCEPCIÓN: NO responder a conversación puramente sentimental/personal entre los padres

6. references_previous = true si:
   - El mensaje es respuesta a algo dicho antes ("sí", "dale", "a las 3", "yo lo hago")
   - Usa pronombres sin antecedente en el propio mensaje ("llévalo", "recógela", "eso")
   - Complementa info parcial de mensajes anteriores
   - Confirma o rechaza algo propuesto antes

7. complexity:
   - "simple": Un solo tema claro con datos completos
   - "ambiguous": Falta info, mezcla temas, abreviaciones, spanglish, referencias implícitas
   - "complex": Múltiples temas en un mensaje, info distribuida, cambios de plan

8. detected_items_count: cuántos ítems accionables DISTINTOS hay (0, 1, 2, 3...)

9. intent (uno principal): EVENT_SCHOOL|EVENT_ACTIVITY|EVENT_MEDICAL|TASK_SHOPPING|TASK_PAYMENT|MEDICATION|LOGISTICS_PICKUP|LOGISTICS_TRANSPORT|SCHEDULE_CHANGE|MILESTONE|SUPPLY_LOW|HEALTH_LOG|CONCERN|CORRECTION|DIRECT_QUESTION|GREETING|CHAT|IGNORE

   CONCERN = un padre expresa preocupación sobre salud, desarrollo, comportamiento de un hijo. NO es accionable pero Nanny PUEDE responder si tiene datos relevantes.
   CORRECTION = un padre corrige a Nanny o corrige información ("yo soy papá", "no es el lunes, es el martes", "no es para Pau, es para Lucía"). Nanny DEBE responder disculpándose y corrigiendo.

10. should_respond = true si:
   - El mensaje es un SALUDO (con o sin "Nanny")
   - Es una pregunta (directa a Nanny o que Nanny puede contestar)
   - Nanny puede aportar valor (can_add_value)
   - Es un CONCERN
   - Es is_direct_to_nanny
   - Es una CORRECCIÓN a algo que Nanny dijo mal
   - should_respond = false SOLO para: mensajes entre padres que son puramente personales/sentimentales, "ok/dale" sin contexto, emojis solos, conversación donde Nanny NO aporta nada

Responde SOLO JSON puro:
{
  "is_actionable": boolean,
  "intent": "string",
  "should_respond": boolean,
  "is_direct_to_nanny": boolean,
  "is_question_nanny_can_answer": boolean,
  "can_add_value": boolean,
  "references_previous": boolean,
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

  const extraRules = await buildRulesText('classifier');
  const prompt = (CLASSIFIER_PROMPT + extraRules)
    .replace('{sender_name}', input.senderName)
    .replace('{sender_role}', input.senderRole)
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
      can_add_value: false,
      references_previous: false,
      complexity: 'ambiguous',
      detected_items_count: 0,
      summary: 'No se pudo clasificar',
    };
  }
}
