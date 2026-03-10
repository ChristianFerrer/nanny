import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `Eres Nanny, una asistente de IA integrada en un chat familiar entre mamá y papá. Tu rol es ayudarles a coordinar la crianza de sus hijos.

PERSONALIDAD:
- Cálida pero eficiente. No eres empalagosa.
- Usas emojis con moderación (1-2 por mensaje máximo).
- Respondes en español natural, como una nanny profesional mexicana/latina.
- Eres proactiva: detectas eventos, tareas y necesidades sin que te lo pidan.

CAPACIDADES:
- Detectar eventos (citas médicas, eventos escolares, cumpleaños, actividades)
- Detectar tareas (compras, trámites, preparativos)
- Resolver referencias ambiguas ("eso", "lo de ayer", "ahí")
- Hacer preguntas de seguimiento cuando falta información
- Confirmar antes de agendar algo importante

FORMATO DE RESPUESTA:
Responde SIEMPRE en JSON con esta estructura:
{
  "reply": "tu mensaje al chat familiar",
  "intent": "EVENT|TASK|INFO|CHAT|UPDATE|REMINDER",
  "child": "nombre del hijo si aplica o null",
  "confirmation": null o {
    "type": "event|task",
    "data": {
      "title": "...",
      "event_type": "doctor|school|birthday|activity|travel|other",
      "date_description": "descripcion de la fecha mencionada",
      "location": "si se menciona",
      "assigned_to": "mama|papa|null"
    }
  }
}

CONTEXTO DE LA FAMILIA:
{family_context}

MENSAJES RECIENTES:
{recent_messages}

REGLAS:
1. Si detectas un evento o tarea, usa confirmation para proponerlo
2. Si falta información (hora, lugar, quién), pregunta en el reply
3. No inventes datos que no se mencionaron
4. Si el mensaje es solo chat casual, intent=CHAT y confirmation=null
5. Si mencionan un hijo, inclúyelo en child
6. Sé concisa: 1-3 oraciones máximo en el reply`;

export async function POST(req: NextRequest) {
  let message = '';
  let familyContext = '';
  let recentMessages = '';

  try {
    const body = await req.json();
    message = body.message || '';
    familyContext = body.familyContext || '';
    recentMessages = body.recentMessages || '';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Mock response when no API key
      return NextResponse.json(getMockResponse(message));
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt = SYSTEM_PROMPT
      .replace('{family_context}', familyContext || 'Familia con 2 hijos: Pau (4 años, va al colegio) y Mía (2 años)')
      .replace('{recent_messages}', recentMessages || '');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error('Chat API error:', error);
    // If OpenAI fails, fall back to mock
    return NextResponse.json(getMockResponse(message));
  }
}

function getMockResponse(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('doctor') || lower.includes('pediatra') || lower.includes('cita')) {
    return {
      reply: '📅 Entendido, agendo la cita médica. ¿A qué hora es y con qué doctor?',
      intent: 'EVENT',
      child: lower.includes('mía') ? 'Mía' : 'Pau',
      confirmation: {
        type: 'event',
        data: { title: 'Cita médica', event_type: 'doctor', date_description: 'Por confirmar' },
      },
    };
  }
  if (lower.includes('comprar') || lower.includes('llevar') || lower.includes('traer')) {
    return {
      reply: '📝 Anotado. ¿Quién se encarga y para cuándo lo necesitan?',
      intent: 'TASK',
      child: null,
      confirmation: {
        type: 'task',
        data: { title: message, assigned_to: null },
      },
    };
  }
  if (lower.includes('colegio') || lower.includes('escuela') || lower.includes('festival')) {
    return {
      reply: '🏫 Lo tengo, evento escolar registrado. ¿Necesitan preparar algo especial?',
      intent: 'EVENT',
      child: 'Pau',
      confirmation: {
        type: 'event',
        data: { title: message, event_type: 'school', date_description: 'Por confirmar' },
      },
    };
  }

  return {
    reply: '👍 Entendido. ¿Necesitan algo más?',
    intent: 'CHAT',
    child: null,
    confirmation: null,
  };
}
