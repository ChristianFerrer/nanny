import { NextRequest } from 'next/server';
import { processChatPipelineStream } from '@/lib/chat/pipeline';
import type { ChatInput } from '@/lib/chat/processChat';
import { runDecisionAgent } from '@/lib/agent/decision-agent';
import { runListener } from '@/lib/chat/listener';
import { getSupabaseAdmin } from '@/lib/supabase';
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
 * AGENT-REWRITE Sprints 1+3 — feature flag USE_NEW_PIPELINE_FAMILY_IDS:
 * Si la familia está en la lista:
 *   1. Listener (Claude Haiku 4.5) captura silenciosamente eventos/tareas/
 *      medicación/rutinas y los persiste en Supabase. Sin reply en chat.
 *   2. Decision agent (Claude Sonnet 4.6) ve los items recién creados en su
 *      contexto de agenda 48h y decide si responder en chat.
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
 * Pipeline nuevo (Sprints 1+3): listener silencioso + decision agent.
 *
 * El mensaje del padre ya está persistido por el cliente antes de llamar a
 * `/api/chat`. Orden:
 *  1. Listener (Haiku) captura items estructurados y los persiste.
 *  2. Decision agent (Sonnet) ve esos items en su contexto y decide si
 *     responder. Si el listener capturó algo, el agent puede acusar
 *     ("Anotado, pediatra viernes 10h."). Si nada, decide igual si tiene
 *     algo que decir (memoria, learning queue, contexto).
 *
 * Si el listener falla, NO bloqueamos el decision agent — el agent sigue
 * funcionando, solo que sin ver los items recién creados. La captura puede
 * recuperarse en el próximo despertar scheduled o vía nightly-catchup.
 */
async function runNewPipeline(args: {
  input: ChatInput;
  messageId: string | null;
  send: (event: string, data: unknown) => void;
}): Promise<void> {
  const { input, messageId, send } = args;

  if (!input.familyId) {
    send('will_respond', { value: false });
    send('response', emptyResponse('CHAT'));
    return;
  }

  // Resolver messageId del trigger si el cliente no lo pasó:
  // tomamos el último mensaje del sender en los últimos 30s con el mismo content.
  const triggeringId = messageId || await findLatestMatchingMessageId(input);

  // ── Paso 1: Listener silencioso. Best-effort: errores se loguean pero
  // no bloquean al decision agent.
  try {
    await runListener({
      familyId: input.familyId,
      message: input.message,
      senderRole: input.senderRole,
      senderName: input.senderName,
      messageId: triggeringId,
    });
  } catch (err) {
    console.error('[chat sse] listener error (continuing to decision agent):', err);
  }

  // ── Paso 2: Decision agent. El decision agent decide TODO en una sola
  // llamada (no hay clasificador separado), así que no podemos avisar antes
  // — corremos y al final emitimos will_respond + response juntos.
  const result = await runDecisionAgent({
    familyId: input.familyId,
    trigger_type: 'message',
    trigger_message_id: triggeringId,
    defer_delivery: true, // entregamos vía SSE, no por insert directo
  });

  if (!result) {
    send('will_respond', { value: false });
    send('response', emptyResponse('CHAT'));
    return;
  }

  const willRespond = result.decision.intervene && !!result.decision.message;
  send('will_respond', { value: willRespond });

  if (!willRespond) {
    send('response', emptyResponse('DECISION_AGENT'));
    return;
  }

  // Devolver al cliente un ChatResponse compatible con la UI actual.
  // El cliente persiste el mensaje de Nanny en la tabla `messages` al
  // recibirlo (mismo flujo que el pipeline viejo). NO insertamos desde el
  // servidor para evitar duplicación.
  // confirmation/pending_detection van null — no hay capture en Sprint 1.
  const text = result.decision.message!;
  const response: ChatResponse = {
    should_respond: true,
    reply: text,
    intent: 'DECISION_AGENT',
    next_action: 'stay_silent',
    child: null,
    confirmation: null,
    additional_confirmations: [],
    pending_detection: null,
    is_proactive: false,
  };
  send('response', response);
}

async function findLatestMatchingMessageId(input: ChatInput): Promise<string | null> {
  if (!input.familyId) return null;
  try {
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const { data } = await getSupabaseAdmin()
      .from('messages')
      .select('id, content')
      .eq('family_id', input.familyId)
      .eq('sender_type', 'parent')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(5);
    const match = (data || []).find(m => (m.content || '').trim() === input.message.trim());
    return match?.id ?? null;
  } catch {
    return null;
  }
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
