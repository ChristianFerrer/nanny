import { NextRequest } from 'next/server';
import { processChatPipelineStream } from '@/lib/chat/pipeline';
import type { ChatInput } from '@/lib/chat/processChat';

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
    senderName: (body.senderName as string) || 'Padre',
    senderRole: (body.senderRole as 'mama' | 'papa') || 'mama',
    pendingDetection: (body.pendingDetection as Record<string, unknown> | null) || null,
    familyId: body.familyId as string | undefined,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        for await (const evt of processChatPipelineStream(input)) {
          if (evt.type === 'will_respond') {
            send('will_respond', { value: evt.value });
          } else if (evt.type === 'response') {
            send('response', evt.response);
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
