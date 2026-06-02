import { NextRequest } from 'next/server';
import { processChatPipelineStream } from '@/lib/chat/pipeline';
import type { ChatInput } from '@/lib/chat/processChat';
import { runAssistant } from '@/lib/chat/assistant';
import type { ChatResponse } from '@/lib/chat/processChat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/chat — endpoint principal del chat de Nanny.
 *
 * Devuelve un stream SSE con dos eventos:
 *
 *   event: will_respond
 *   data: {"value": true}
 *
 *   event: response
 *   data: { ...ChatResponse }
 *
 * El cliente:
 *  - Recibe `will_respond=true` apenas el classifier decide → prende los
 *    3 puntitos como anticipación REAL de que va a llegar un mensaje.
 *  - Recibe `will_respond=false` → no muestra nada en el chat.
 *  - Recibe `response` → apaga los puntitos y, si `should_respond=true`,
 *    persiste el mensaje de Nanny.
 *
 * Feature flag USE_NEW_PIPELINE_FAMILY_IDS:
 * Si la familia está en la lista, una sola llamada a Claude (Nanny Assistant)
 * lee la conversación reciente + lo ya anotado, decide qué anotar y qué
 * responder, persiste, y devuelve el reply. Sin classifier/extractor/responder.
 * El formato SSE se mantiene para no romper el cliente.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Bad JSON', 400);
  }

  const input: ChatInput = {
    message: (body.message as string) || '',
    familyContext: (body.familyContext as string) || '',
    recentMessages: (body.recentMessages as string) || '',
    existingEvents: (body.existingEvents as string) || 'Ninguno',
    existingTasks: (body.existingTasks as string) || 'Ninguna',
    activeMedications: (body.activeMedications as string) || 'Ninguno',
    existingRoutines: (body.existingRoutines as string) || 'Ninguna',
    childrenNames: Array.isArray(body.childrenNames) ? body.childrenNames as string[] : [],
    senderName: (body.senderName as string) || 'Padre',
    senderRole: (body.senderRole as 'mama' | 'papa') || 'mama',
    pendingDetection: (body.pendingDetection as Record<string, unknown> | null) || null,
    familyId: body.familyId as string | undefined,
  };

  const messageId = typeof body.messageId === 'string' ? body.messageId : null;
  const useNewPipeline = isNewPipelineFamily(input.familyId);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        if (useNewPipeline) {
          await runNewPipeline({ input, messageId, send });
        } else {
          for await (const evt of processChatPipelineStream(input)) {
            if (evt.type === 'will_respond') {
              send('will_respond', { value: evt.value });
            } else if (evt.type === 'response') {
              send('response', evt.response);
            }
          }
        }
        send('done', { ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        console.error('[chat sse] error:', message);
        // Mapeo de errores comunes a códigos accionables para el cliente
        let code = 'INTERNAL';
        if (message.includes('Incorrect API key') || message.includes('invalid_api_key')) code = 'OPENAI_KEY';
        else if (message.includes('insufficient_quota') || message.includes('rate_limit')) code = 'OPENAI_QUOTA';
        else if (message.includes('ANTHROPIC_API_KEY')) code = 'ANTHROPIC_KEY';
        send('error', { code, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering
    },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isNewPipelineFamily(familyId: string | undefined): boolean {
  if (!familyId) return false;
  const raw = process.env.USE_NEW_PIPELINE_FAMILY_IDS;
  if (!raw) return false;
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(familyId);
}

/**
 * Pipeline nuevo: Nanny Assistant — el cerebro único.
 *
 * UNA llamada a Claude por mensaje. Lee la conversación reciente + lo ya
 * anotado, decide qué anotar (tools) y qué responder (texto), persiste, y
 * devuelve el reply. Sin classifier, sin listener separado, sin decision
 * agent. Confiamos en la inteligencia del modelo con el contexto correcto.
 *
 * El mensaje del padre ya está persistido por el cliente antes de llamar a
 * `/api/chat` (el assistant lo lee al cargar la conversación reciente).
 */
async function runNewPipeline(args: {
  input: ChatInput;
  messageId: string | null;
  send: (event: string, data: unknown) => void;
}): Promise<void> {
  const { input, send } = args;

  if (!input.familyId) {
    send('will_respond', { value: false });
    send('response', emptyResponse('CHAT'));
    return;
  }

  // El assistant decide TODO en una sola llamada: leemos, anotamos y
  // respondemos. No podemos avisar will_respond antes de terminar.
  const result = await runAssistant({
    familyId: input.familyId,
    senderRole: input.senderRole,
    senderName: input.senderName,
  });

  const reply = result.reply;
  send('will_respond', { value: !!reply });

  if (!reply) {
    send('response', emptyResponse('ASSISTANT'));
    return;
  }

  // El cliente persiste el mensaje de Nanny al recibirlo (mismo flujo que
  // el pipeline viejo). Los items ya quedaron persistidos por el assistant.
  const response: ChatResponse = {
    should_respond: true,
    reply,
    intent: 'ASSISTANT',
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
    is_proactive: false,
  };
  send('response', response);
}

function emptyResponse(intent: string): ChatResponse {
  return {
    should_respond: false,
    reply: '',
    intent,
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
  };
}
