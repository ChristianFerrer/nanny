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
      console.warn('OPENAI_API_KEY not configured — using mock responses');
      return NextResponse.json(getMockResponse(message));
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt = SYSTEM_PROMPT
      .replace('{family_context}', familyContext || 'Familia con 2 hijos: Pau (4 años, va al colegio) y Mía (2 años)')
      .replace('{recent_messages}', recentMessages || '');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
    console.error('Chat API error:', error instanceof Error ? error.message : error);
    // If OpenAI fails, fall back to mock
    return NextResponse.json(getMockResponse(message));
  }
}

function detectChild(lower: string): string | null {
  if (lower.includes('mía') || lower.includes('mia')) return 'Mía';
  if (lower.includes('pau')) return 'Pau';
  return null;
}

function getMockResponse(message: string) {
  const lower = message.toLowerCase();
  const child = detectChild(lower);

  // Greetings
  if (/^(hola|hey|buenos|buenas|hi|qué tal|que tal|ey)\b/.test(lower)) {
    return {
      reply: '¡Hola! 👋 Aquí estoy. ¿En qué les puedo ayudar?',
      intent: 'CHAT',
      child: null,
      confirmation: null,
    };
  }

  // Medical appointments
  if (lower.includes('doctor') || lower.includes('pediatra') || lower.includes('cita') || lower.includes('médico') || lower.includes('medico') || lower.includes('hospital') || lower.includes('dentista') || lower.includes('vacuna')) {
    return {
      reply: '📅 Entendido, agendo la cita médica. ¿A qué hora es y con qué doctor?',
      intent: 'EVENT',
      child: child || 'Pau',
      confirmation: {
        type: 'event',
        data: { title: 'Cita médica', event_type: 'doctor', date_description: 'Por confirmar' },
      },
    };
  }

  // Tasks: shopping, errands
  if (lower.includes('comprar') || lower.includes('llevar') || lower.includes('traer') || lower.includes('falta') || lower.includes('necesitamos') || lower.includes('uniforme') || lower.includes('ropa') || lower.includes('pañales') || lower.includes('leche')) {
    return {
      reply: `📝 Anoté: ${message}. ¿Quién se encarga? ¿Para cuándo lo necesitan?`,
      intent: 'TASK',
      child,
      confirmation: {
        type: 'task',
        data: { title: message, assigned_to: null },
      },
    };
  }

  // School events
  if (lower.includes('colegio') || lower.includes('escuela') || lower.includes('festival') || lower.includes('clase') || lower.includes('maestra') || lower.includes('tarea') || lower.includes('recreo')) {
    return {
      reply: '🏫 Lo tengo, evento escolar registrado. ¿Necesitan preparar algo especial?',
      intent: 'EVENT',
      child: child || 'Pau',
      confirmation: {
        type: 'event',
        data: { title: message, event_type: 'school', date_description: 'Por confirmar' },
      },
    };
  }

  // Time-based events: pickup, activities, appointments with hours
  if (lower.includes('recoger') || lower.includes('sale a las') || lower.includes('llevar a') || lower.includes('visitar') || lower.includes('tenemos que') || lower.includes('hay que') || /\b\d{1,2}(:\d{2})?\s*(am|pm|hrs|h)?\b/.test(lower)) {
    return {
      reply: `📋 Anotado: ${message}. ¿Quién se encarga de esto?`,
      intent: 'EVENT',
      child,
      confirmation: {
        type: 'event',
        data: { title: message, event_type: 'activity', date_description: 'Hoy' },
      },
    };
  }

  // Birthday, celebrations
  if (lower.includes('cumpleaños') || lower.includes('fiesta') || lower.includes('celebración') || lower.includes('piñata') || lower.includes('regalo')) {
    return {
      reply: '🎉 ¡Qué emoción! ¿Cuándo es y dónde será?',
      intent: 'EVENT',
      child,
      confirmation: {
        type: 'event',
        data: { title: message, event_type: 'birthday', date_description: 'Por confirmar' },
      },
    };
  }

  // Thanks
  if (lower.includes('gracias') || lower.includes('perfecto') || lower.includes('genial') || lower.includes('ok') || lower.includes('listo')) {
    return {
      reply: '👍 ¡De nada! Aquí estoy para lo que necesiten.',
      intent: 'CHAT',
      child: null,
      confirmation: null,
    };
  }

  // Default: acknowledge and ask for more info
  return {
    reply: `📝 Entendido: "${message}". ¿Necesitan que lo agende o es solo informativo?`,
    intent: 'INFO',
    child,
    confirmation: null,
  };
}
