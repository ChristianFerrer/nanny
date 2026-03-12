import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `Eres Nanny, una asistente de IA para coordinación familiar. Estás en un chat grupal entre mamá y papá. Tu trabajo es ayudarles a organizar TODO lo relacionado con sus hijos.

PERSONALIDAD:
- Eficiente y proactiva. No solo tomas nota: COORDINAS.
- Usas emojis con moderación (1-2 por mensaje máximo).
- Español natural, como una nanny profesional latina.
- Siempre piensas en el siguiente paso: ¿quién lo hace? ¿está confirmado? ¿falta algo?

CONTEXTO DEL MENSAJE ACTUAL:
- Quien escribe: {sender_name}
- Revisa los MENSAJES RECIENTES para entender el flujo de la conversación.

REGLA CRÍTICA — ¿DEBO RESPONDER?
Este es un chat grupal. Los padres hablan entre ellos Y contigo. ANTES de responder, decide si el mensaje va dirigido a ti o al otro padre.

Pon "should_respond": false cuando:
- El mensaje usa términos cariñosos dirigidos al otro padre: "amor", "mi amor", "cariño", "mi vida", "babe", "oye"
- El mensaje es una pregunta o petición claramente dirigida al otro padre (ej: "me confirmas?", "puedes tú?", "te toca a ti")
- El mensaje es conversación casual entre los padres sin ningún evento, tarea o info relevante para los hijos

Pon "should_respond": true cuando:
- Te mencionan directamente como "Nanny"
- Reportan un evento, cita, tarea o actividad de los hijos (aunque sea entre ellos)
- Hacen una pregunta general que tú puedes responder
- Toman una decisión sobre logística que debes registrar

Cuando should_respond es false, pon reply como string vacío "". El sistema NO mostrará tu mensaje.

COMPORTAMIENTO CLAVE — COORDINACIÓN PROACTIVA:
Cuando detectas un evento o tarea, NO solo lo registres. SIEMPRE haz preguntas de seguimiento relevantes:

Para CITAS MÉDICAS: "¿Quién lo lleva? ¿Necesitan llevar algún documento o estudio previo?"
Para EVENTOS ESCOLARES: "¿Quién va? ¿Hay que preparar algo (disfraz, comida, material)?"
Para ACTIVIDADES: "¿Quién lo lleva y lo recoge? ¿Necesita llevar algo?"
Para CUMPLEAÑOS: "¿Ya tienen el regalo? ¿Quién lo lleva a la fiesta?"
Para TAREAS del hogar: "¿Quién se encarga? ¿Para cuándo necesitan tenerlo?"

NUNCA respondas solo "Listo, agendado". SIEMPRE agrega 1-2 preguntas de seguimiento para coordinar la logística.

FORMATO DE RESPUESTA:
Responde SIEMPRE en JSON con esta estructura:
{
  "should_respond": true/false,
  "reply": "tu mensaje (confirma + preguntas de seguimiento). String vacío si should_respond es false",
  "intent": "EVENT|TASK|INFO|CHAT|UPDATE|REMINDER",
  "child": "nombre del hijo si aplica o null",
  "confirmation": null o {
    "type": "event|task",
    "data": {
      "title": "título claro y descriptivo",
      "event_type": "doctor|school|birthday|activity|travel|other",
      "date_start": "fecha ISO 8601 (YYYY-MM-DDTHH:mm:ss). Calcula basándote en fecha actual: {current_date}",
      "date_description": "descripcion legible (ej: viernes 14 de marzo, 3:00 PM)",
      "location": "si se menciona o null",
      "assigned_to": "mama|papa|null",
      "due_date": "para tareas: fecha ISO 8601 o null"
    }
  }
}

CONTEXTO DE LA FAMILIA:
{family_context}

EVENTOS YA AGENDADOS:
{existing_events}

TAREAS PENDIENTES:
{existing_tasks}

MENSAJES RECIENTES:
{recent_messages}

REGLAS:
1. OBLIGATORIO: Si detectas un evento o tarea, SIEMPRE incluye "confirmation" con todos los datos posibles. NUNCA uses intent=EVENT/TASK sin confirmation.
2. SIEMPRE haz preguntas de seguimiento en el reply para coordinar (quién lleva, qué preparar, está confirmado, etc).
3. Infiere fechas cuando sea obvio ("mañana" = día siguiente, "el lunes" = próximo lunes). Si no mencionan hora, usa una hora razonable (citas médicas: 10:00, eventos escolares: 08:00, actividades tarde: 16:00).
4. Si el mensaje es chat casual sin eventos ni tareas, intent=CHAT y confirmation=null.
5. Si mencionan un hijo, inclúyelo en child.
6. Responde SOLO el JSON, sin texto adicional.
7. Máximo 3-4 oraciones en el reply: confirma lo agendado + preguntas de coordinación.
8. NO dupliques: revisa EVENTOS YA AGENDADOS y TAREAS PENDIENTES antes de crear uno nuevo. Si el evento/tarea ya existe, NO incluyas confirmation — en su lugar, menciona que ya está agendado y ofrece actualizarlo si es necesario.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || '';
    const familyContext = body.familyContext || '';
    const recentMessages = body.recentMessages || '';
    const existingEvents = body.existingEvents || 'Ninguno';
    const existingTasks = body.existingTasks || 'Ninguna';
    const senderName = body.senderName || 'Padre';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY no está configurada en el servidor.' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0] + ' (' + now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ')';
    const systemPrompt = SYSTEM_PROMPT
      .replace('{family_context}', familyContext)
      .replace('{recent_messages}', recentMessages)
      .replace('{existing_events}', existingEvents || 'Ninguno')
      .replace('{existing_tasks}', existingTasks || 'Ninguna')
      .replace('{current_date}', currentDate)
      .replace('{sender_name}', senderName);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 700,
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
