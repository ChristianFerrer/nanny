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
  silent_action: boolean;
  topic_hint: { parent_title: string; child_name: string | null } | null;
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
   - Una tarea concreta — IMPERATIVA o DECLARATIVA. Ambas formas son accionables:
     * Imperativa: "hay que comprar X", "compremos X", "compra X", "tenemos que pagar X"
     * Declarativa: "está pendiente comprar X", "queda comprar X", "falta X", "nos falta X", "todavía hay que X", "quedó pendiente X"
   - Info médica (cita, medicamento, síntomas)
   - Delegación de responsabilidad ("yo lo hago", "tú encárgate")
   - Confirmación/complemento de una detección pendiente ("ok", "dale", "a las 3", etc.)
   - Cambio de plan sobre algo ya mencionado
   - **Acción PASADA reportada que pertenece a un TEMA con otras actividades pendientes** (ver regla 11 sobre topics).
     Ejemplo: si el padre dice "ya hice la invitación" Y en el mismo mensaje o conversación reciente se ven otras
     actividades del mismo cumple/viaje/proyecto → ES ACCIONABLE (registrar como sub-tarea completada del topic).

2. is_actionable = false si el mensaje es:
   - Solo cariño/emojis sin info ("te amo", "❤️", "besos")
   - Conversación casual sin acción ("cómo dormiste?", "bien gracias")
   - Queja/desahogo sin info logística ("siempre me toca a mí" sin evento concreto)
   - "ok"/"dale" sin detección pendiente activa
   - **Acción PASADA aislada sin topic relacionado** ("ya almorcé") → INFO/CHAT, no accionable

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

11. **TOPIC / GROUPING**: Detectar si el mensaje pertenece a un "tema paraguas" con
    múltiples sub-actividades. Usá topic_hint cuando el mensaje (solo o en
    contexto reciente) menciona cosas del MISMO proyecto / evento / tema:
    - Cumpleaños de un hijo (decoración, invitaciones, salón, regalos, sorpresitas, torta)
    - Viaje próximo (boletos, hotel, equipaje, documentación)
    - Inicio escolar (uniforme, útiles, mochila, libros)
    - Mudanza, fiesta, evento médico extendido, etc.

    Cuando el mensaje contiene VARIAS actividades de un mismo topic — sea pasadas
    completadas o futuras pendientes — emitir topic_hint con:
    - parent_title: nombre corto del topic (ej. "Cumpleaños Pau")
    - child_name: nombre del hijo si el topic gira alrededor de uno

    Si NO hay topic identificable o hay UNA sola actividad sin grupo: topic_hint = null.

12. silent_action = true cuando los padres cerraron un loop entre ellos y Nanny solo necesita REGISTRAR sin hablar. Casos:
   - Un padre asume responsabilidad explícita ("yo lo recojo", "yo me encargo") como respuesta a algo del otro padre, y la asignación queda CLARA con datos suficientes (qué, cuándo, quién)
   - El otro padre confirma con "dale/ok/perfecto" cerrando un acuerdo previo CON pending_detection ya completable
   - No falta ningún dato crítico para crear el evento/tarea (asignación sí, horario implícito o ya conocido)
   - NO hay conflicto detectado con eventos/tareas/medicamentos existentes
   - NO es médico (medicación siempre confirma)
   - NO es CONCERN ni CORRECTION ni pregunta directa

   Si silent_action = true, el sistema registra la información pero Nanny NO responde. Es la opción correcta cuando los padres están coordinando bien y agregar un mensaje de confirmación solo aporta ruido.

   silent_action es independiente de should_respond. Cuando silent_action=true, ignoramos should_respond.

Responde SOLO JSON puro:
{
  "is_actionable": boolean,
  "intent": "string",
  "should_respond": boolean,
  "is_direct_to_nanny": boolean,
  "is_question_nanny_can_answer": boolean,
  "can_add_value": boolean,
  "references_previous": boolean,
  "silent_action": boolean,
  "topic_hint": null | { "parent_title": "string corto", "child_name": "string o null" },
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
    max_tokens: 280,
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
    return {
      is_actionable: false,
      intent: 'CHAT',
      should_respond: false,
      is_direct_to_nanny: false,
      is_question_nanny_can_answer: false,
      can_add_value: false,
      references_previous: false,
      silent_action: false,
      topic_hint: null,
      complexity: 'ambiguous',
      detected_items_count: 0,
      summary: 'No se pudo clasificar',
    };
  }
}
