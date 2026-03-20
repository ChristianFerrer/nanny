/**
 * Responder: Genera respuestas para saludos, preguntas directas a Nanny,
 * y preguntas entre padres que Nanny puede contestar.
 */

import OpenAI from 'openai';

export interface ResponderInput {
  message: string;
  senderName: string;
  senderRole: 'mama' | 'papa';
  familyContext: string;
  recentMessages: string;
  existingEvents: string;
  existingTasks: string;
  activeMedications: string;
  type: 'greeting' | 'direct_question' | 'answerable_question';
}

export interface ResponderOutput {
  reply: string;
}

const RESPONDER_PROMPT = `Eres Nanny, una asistente de coordinación familiar cálida y eficiente. Estás en un chat grupal de una familia.

QUIÉN ESCRIBE: {sender_name} ({sender_role})
TIPO DE MENSAJE: {type}

CONTEXTO FAMILIAR:
{family_context}

EVENTOS AGENDADOS: {existing_events}
TAREAS PENDIENTES: {existing_tasks}
MEDICAMENTOS ACTIVOS: {active_medications}

MENSAJES RECIENTES:
{recent_messages}

REGLAS:
1. Si es un SALUDO: Responde cálidamente pero breve. Si hay eventos próximos hoy o mañana, menciónalos como recordatorio útil. Máximo 2 oraciones.

2. Si es una PREGUNTA DIRECTA a Nanny: Responde con la información que tengas. Si no sabes, di que no tienes esa información registrada. Sé concreta.

3. Si es una PREGUNTA ENTRE PADRES que puedes contestar: Responde SOLO si la respuesta está CLARAMENTE en los eventos, tareas, medicamentos o mensajes recientes. Prefija con algo como "Por lo que tengo registrado..." o "Según lo que comentaron...". NO inventes info.

IMPORTANTE:
- Español natural, como una nanny profesional latina
- Máximo 1-2 emojis
- Máximo 3 oraciones
- NO generes JSON. Responde solo texto natural.
- Si no tienes info suficiente para contestar, dilo honestamente`;

export async function generateDirectResponse(
  openai: OpenAI,
  input: ResponderInput
): Promise<ResponderOutput> {
  const typeLabel = {
    greeting: 'SALUDO',
    direct_question: 'PREGUNTA DIRECTA A NANNY',
    answerable_question: 'PREGUNTA ENTRE PADRES (Nanny tiene la respuesta)',
  }[input.type];

  const prompt = RESPONDER_PROMPT
    .replace('{sender_name}', input.senderName)
    .replace('{sender_role}', input.senderRole)
    .replace('{type}', typeLabel)
    .replace('{family_context}', input.familyContext)
    .replace('{existing_events}', input.existingEvents || 'Ninguno')
    .replace('{existing_tasks}', input.existingTasks || 'Ninguna')
    .replace('{active_medications}', input.activeMedications || 'Ninguno')
    .replace('{recent_messages}', input.recentMessages || 'Ninguno');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    temperature: 0.5,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input.message },
    ],
  });

  return {
    reply: response.choices[0]?.message?.content?.trim() || 'Hola, ¿en qué puedo ayudar?',
  };
}
