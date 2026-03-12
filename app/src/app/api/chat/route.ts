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
6. Sé concisa: 1-3 oraciones máximo en el reply
7. Responde SOLO el JSON, sin texto adicional`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || '';
    const familyContext = body.familyContext || '';
    const recentMessages = body.recentMessages || '';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY no está configurada en el servidor.' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt = SYSTEM_PROMPT
      .replace('{family_context}', familyContext)
      .replace('{recent_messages}', recentMessages);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: 'No se recibió respuesta de la IA.' },
        { status: 500 }
      );
    }

    // Parse JSON response, handling potential markdown code blocks
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(cleanContent);
      return NextResponse.json(parsed);
    } catch {
      // If AI didn't return valid JSON, wrap the text as a chat reply
      return NextResponse.json({
        reply: content,
        intent: 'CHAT',
        child: null,
        confirmation: null,
      });
    }
  } catch (error: unknown) {
    console.error('Chat API error:', error instanceof Error ? error.message : error);

    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    // Surface specific OpenAI errors
    if (errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key')) {
      return NextResponse.json(
        { error: 'La API key de OpenAI es inválida. Verifica la configuración.' },
        { status: 401 }
      );
    }
    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('rate_limit')) {
      return NextResponse.json(
        { error: 'Se agotó la cuota de OpenAI o hay demasiadas solicitudes. Intenta en unos minutos.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Error al comunicarse con la IA. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
