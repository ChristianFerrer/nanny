/**
 * Cliente SSE para /api/chat.
 *
 * Llama a la API y consume el stream de eventos:
 *  - `will_respond` apenas el classifier termina (~500ms)
 *  - `response` cuando el extractor/responder termina (~2-3s)
 *
 * Uso:
 *   await callChatStream(payload, {
 *     onWillRespond: (will) => setShowDots(will),
 *     onResponse: (data) => addNannyMessage(data),
 *     onError: (err) => showError(err),
 *   });
 */

import type { ChatResponse } from './chat/processChat';

export interface ChatStreamPayload {
  message: string;
  familyContext: string;
  recentMessages: string;
  existingEvents: string;
  existingTasks: string;
  activeMedications: string;
  existingRoutines?: string;
  senderName: string;
  senderRole: 'mama' | 'papa';
  pendingDetection: Record<string, unknown> | null;
  familyId?: string;
}

export interface ChatStreamCallbacks {
  onWillRespond: (willRespond: boolean) => void | Promise<void>;
  onResponse: (response: ChatResponse) => void | Promise<void>;
  onError?: (code: string, message: string) => void | Promise<void>;
}

export async function callChatStream(payload: ChatStreamPayload, callbacks: ChatStreamCallbacks): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    callbacks.onError?.('HTTP', `Chat request failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines (\n\n).
    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      sepIdx = buffer.indexOf('\n\n');

      const parsed = parseEvent(rawEvent);
      if (!parsed) continue;
      await handleEvent(parsed, callbacks);
    }
  }

  // Flush trailing event if any (rare; server adds final \n\n)
  if (buffer.trim().length > 0) {
    const parsed = parseEvent(buffer);
    if (parsed) await handleEvent(parsed, callbacks);
  }
}

function parseEvent(raw: string): { event: string; data: string } | null {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
    else if (line.startsWith('data:')) data += line.slice(5);
  }
  if (!data) return null;
  return { event, data };
}

async function handleEvent(parsed: { event: string; data: string }, cb: ChatStreamCallbacks) {
  try {
    const json = JSON.parse(parsed.data);
    if (parsed.event === 'will_respond') {
      await cb.onWillRespond(Boolean(json.value));
    } else if (parsed.event === 'response') {
      await cb.onResponse(json as ChatResponse);
    } else if (parsed.event === 'error') {
      await cb.onError?.(json.code || 'UNKNOWN', json.message || 'Error');
    }
    // 'done' es informativo; no hace falta acción
  } catch (e) {
    console.warn('[chat-stream] failed to parse event', parsed.event, e);
  }
}
