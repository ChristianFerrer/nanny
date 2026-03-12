import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const CATCHUP_PROMPT = `Eres Nanny, una asistente de IA para coordinación familiar. Se te pide que RE-ANALICES todo el historial de conversación para encontrar información importante que NO fue capturada.

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
Revisa TODOS los mensajes y encuentra información ACCIONABLE que NO esté ya registrada. Busca:

1. TRATAMIENTOS MÉDICOS: medicinas, antibióticos, dosis, horarios, duración
2. EVENTOS: citas médicas, eventos escolares, cumpleaños, actividades
3. TAREAS: inscripciones, trámites, documentos, compras, cosas por hacer
4. LOGÍSTICA: quién lleva, quién recoge, horarios importantes

REGLAS CRÍTICAS:
- OBLIGATORIO: Si encuentras CUALQUIER información accionable, DEBES incluirla en found_items. NUNCA menciones algo en el reply sin incluirlo en found_items.
- NO dupliques: si algo ya está registrado, NO lo incluyas
- Analiza GRUPOS de mensajes juntos — la info puede estar distribuida
- Infiere fechas relativas basándote en la fecha del mensaje y la fecha actual
- Si alguien dice "yo veo lo de X" o "yo me encargo de X", eso es una TAREA

FORMATO DE RESPUESTA — SIGUE EXACTAMENTE ESTA ESTRUCTURA:
{
  "found_items": [
    {
      "type": "medication",
      "summary": "descripción breve",
      "child": "nombre del hijo o null",
      "data": {
        "medication_name": "nombre del medicamento",
        "duration_days": 10,
        "start_date": "2026-03-07T00:00:00",
        "end_date": "2026-03-17T00:00:00",
        "frequency": "cada 8 horas",
        "schedule_times": ["08:00", "16:00", "00:00"]
      }
    },
    {
      "type": "event",
      "summary": "descripción breve",
      "child": "nombre del hijo o null",
      "data": {
        "title": "título del evento",
        "event_type": "doctor|school|birthday|activity|travel|other",
        "date_start": "2026-03-15T10:00:00",
        "date_description": "sábado 15 de marzo, 10:00 AM",
        "location": "lugar o null"
      }
    },
    {
      "type": "task",
      "summary": "descripción breve",
      "child": "nombre del hijo o null",
      "data": {
        "title": "título de la tarea",
        "assigned_to": "mama|papa|null",
        "due_date": "2026-03-13T00:00:00"
      }
    }
  ],
  "reply": "Revisé el chat y encontré N cosas que no tenía registradas:\\n\\n1. Título - detalle\\n2. Título - detalle\\n\\n¿Quieren que cree recordatorios para los tratamientos?"
}

EJEMPLO CONCRETO:
Si ves estos mensajes:
- "Amor hasta cuándo es el antibiótico de Pau"
- "10 días desde el sábado 7/3"
- "Cada 8 horas"
- "8hr-16hr-00hr"
- "Yo veo lo del padrón para la inscripción de Pau, creo q lo puedo tener para mañana"

Debes retornar:
{
  "found_items": [
    {
      "type": "medication",
      "summary": "Antibiótico de Pau - 10 días, cada 8h",
      "child": "Pau",
      "data": {
        "medication_name": "Antibiótico",
        "duration_days": 10,
        "start_date": "2026-03-07T00:00:00",
        "end_date": "2026-03-17T00:00:00",
        "frequency": "cada 8 horas",
        "schedule_times": ["08:00", "16:00", "00:00"]
      }
    },
    {
      "type": "task",
      "summary": "Padrón para inscripción de Pau",
      "child": "Pau",
      "data": {
        "title": "Conseguir padrón para inscripción de Pau",
        "assigned_to": "mama",
        "due_date": "2026-03-13T00:00:00"
      }
    }
  ],
  "reply": "Revisé el chat y encontré 2 cosas que no tenía registradas:\\n\\n1. 💊 Antibiótico de Pau - 10 días desde el 7/3, cada 8h (8:00, 16:00, 00:00)\\n2. 📋 Padrón para inscripción de Pau - pendiente\\n\\n¿Quieren que cree recordatorios para el antibiótico?"
}

Si no hay nada nuevo:
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
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Aquí está el historial COMPLETO del chat familiar. Analízalo y encuentra TODA la información accionable que no ha sido capturada. DEBES incluir cada item encontrado en found_items:\n\n${allMessages}` },
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
      // Ensure found_items is always an array
      if (!Array.isArray(parsed.found_items)) {
        parsed.found_items = [];
      }
      console.log('Catchup found items:', JSON.stringify(parsed.found_items, null, 2));
      return NextResponse.json(parsed);
    } catch {
      console.error('Failed to parse catchup JSON:', cleanContent.substring(0, 500));
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
