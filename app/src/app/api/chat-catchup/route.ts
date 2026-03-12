import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const CATCHUP_PROMPT = `Eres Nanny, una asistente de IA para coordinación familiar. Se te pide que RE-ANALICES todo el historial de conversación de un chat familiar para encontrar información importante que NO fue capturada previamente.

FECHA ACTUAL: {current_date}

CONTEXTO DE LA FAMILIA:
{family_context}

EVENTOS YA REGISTRADOS:
{existing_events}

TAREAS YA REGISTRADAS:
{existing_tasks}

MEDICAMENTOS YA REGISTRADOS:
{active_medications}

TU MISIÓN:
Revisa TODOS los mensajes del chat y encuentra información ACCIONABLE que NO esté ya registrada en los eventos, tareas o medicamentos existentes.

Busca específicamente:
1. TRATAMIENTOS MÉDICOS: medicinas, antibióticos, dosis, horarios, duración
2. EVENTOS: citas médicas, eventos escolares, cumpleaños, actividades
3. TAREAS: inscripciones, trámites, documentos, compras, cosas por hacer
4. LOGÍSTICA: quién lleva, quién recoge, horarios importantes

REGLAS IMPORTANTES:
- NO dupliques: si algo ya está en eventos/tareas/medicamentos registrados, NO lo incluyas
- Solo incluye información ACCIONABLE y CONCRETA (con fechas, horarios, o responsables)
- Analiza GRUPOS de mensajes juntos — la información puede estar distribuida en varios mensajes
- Infiere fechas relativas basándote en la fecha del mensaje y la fecha actual

FORMATO DE RESPUESTA:
Responde en JSON con esta estructura:
{
  "found_items": [
    {
      "type": "medication|event|task",
      "summary": "descripción breve legible para los padres",
      "child": "nombre del hijo o null",
      "data": {
        // Para medication:
        "medication_name": "string",
        "duration_days": number,
        "start_date": "ISO 8601",
        "end_date": "ISO 8601",
        "frequency": "string",
        "schedule_times": ["HH:mm", ...]

        // Para event:
        "title": "string",
        "event_type": "doctor|school|birthday|activity|travel|other",
        "date_start": "ISO 8601",
        "date_description": "string legible",
        "location": "string o null"

        // Para task:
        "title": "string",
        "assigned_to": "mama|papa|null",
        "due_date": "ISO 8601 o null"
      }
    }
  ],
  "reply": "Mensaje resumen para los padres. Si no encontraste nada nuevo, di que ya está todo capturado. Si encontraste cosas, enuméralas brevemente."
}

Si no encuentras nada nuevo que no esté registrado, responde:
{
  "found_items": [],
  "reply": "Revisé todo el chat y ya tengo toda la información capturada 👍"
}

Responde SOLO el JSON, sin texto adicional.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const allMessages = body.allMessages || '';
    const familyContext = body.familyContext || '';
    const existingEvents = body.existingEvents || 'Ninguno';
    const existingTasks = body.existingTasks || 'Ninguna';
    const activeMedications = body.activeMedications || 'Ninguno';

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
    const systemPrompt = CATCHUP_PROMPT
      .replace('{family_context}', familyContext)
      .replace('{existing_events}', existingEvents)
      .replace('{existing_tasks}', existingTasks)
      .replace('{active_medications}', activeMedications)
      .replace('{current_date}', currentDate);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Aquí está el historial COMPLETO del chat familiar. Analízalo y encuentra toda la información que no ha sido capturada:\n\n${allMessages}` },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: 'No se recibió respuesta de la IA.' },
        { status: 500 }
      );
    }

    let cleanContent = content.trim();
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(cleanContent);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({
        found_items: [],
        reply: content,
      });
    }
  } catch (error: unknown) {
    console.error('Chat catchup error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Error al analizar el historial. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
