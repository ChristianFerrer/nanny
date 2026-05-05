import type { Page } from '@playwright/test';
import { FAMILY_ID, getFamilyDataResponse, mockMessages } from './family';
import { pickResponse } from './responses';

/**
 * Setea todos los mocks HTTP necesarios para que el chat de Nanny renderee
 * sin tocar Supabase ni OpenAI reales.
 *
 * IMPORTANTE: la app usa @supabase/ssr que persiste la sesión en COOKIES
 * (no localStorage). Por eso seteamos cookies en el context.
 *
 * Mockea:
 * - Cookie de sesión Supabase (con JWT estructuralmente válido)
 * - Supabase Auth/REST endpoints (por si la lib hace llamadas)
 * - `/api/check-family` → tiene familia
 * - `/api/family-data` → datos fijos de la familia mock
 * - `/api/chat` → respuesta determinística según keywords
 * - `/api/family-write` → 200 OK con echo
 *
 * Llamar este helper ANTES de `page.goto('/chat')`.
 */
export async function setupChatMocks(page: Page) {
  // Auth se bypasea via NEXT_PUBLIC_E2E_TEST_MODE (ver app/src/lib/supabase.ts
  // y app/src/middleware.ts). No hace falta setear cookies ni interceptar
  // endpoints de Supabase auth.

  // Defensa en profundidad: si algo aun hace llamadas a Supabase, devolver vacio.
  await page.route(/supabase\.co\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // 3) /api/check-family → tiene familia
  await page.route('**/api/check-family', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasFamily: true, familyId: FAMILY_ID }),
    }),
  );

  // 4) /api/family-data?tables=... → datos según las tablas pedidas.
  // Incluye familyId + currentParentId que el cliente espera para inicializar
  // el state de _currentFamilyId / _currentParentId en el store.
  await page.route(/\/api\/family-data(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const tablesParam = url.searchParams.get('tables') || '';
    const tables = tablesParam.split(',').filter(Boolean);
    const data = getFamilyDataResponse(tables);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });

  // 5) /api/chat → SSE stream con dos eventos: will_respond + response.
  //
  // El cliente (chat-stream.ts) consume Server-Sent Events, no JSON. El mock
  // tiene que emitir el formato exacto que pareasea parseEvent():
  //   event: will_respond\n
  //   data: {"value": true}\n
  //   \n
  //   event: response\n
  //   data: {<ChatResponse>}\n
  //   \n
  //   event: done\n
  //   data: {"ok": true}\n
  //   \n
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { message?: string } | null;
    const text = body?.message || '';
    const response = pickResponse(text);

    const sseChunks = [
      `event: will_respond\ndata: ${JSON.stringify({ value: true })}\n\n`,
      `event: response\ndata: ${JSON.stringify({
        reply: response.reply,
        intent: response.intent,
        next_action: response.next_action,
        child: response.child,
        confirmation: response.confirmation,
        should_respond: true,
        additional_confirmations: [],
        pending_detection: null,
      })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`,
    ];

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
      body: sseChunks.join(''),
    });
  });

  // 6) /api/family-write → 200 OK con echo del row insertado.
  // IMPORTANTE: el cliente espera result.data = el row, no el payload completo.
  // El payload tiene la forma { table, operation, data, id }, y result.data
  // debe ser solo `data` (el row) para que addMessage()/addEvent() etc.
  // retornen el objeto correcto al caller.
  await page.route('**/api/family-write', async (route) => {
    const body = route.request().postDataJSON() as { data?: unknown } | null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: body?.data ?? null }),
    });
  });

  // 7) /api/chat-catchup → resumen vacío
  await page.route('**/api/chat-catchup', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ summary: 'Sin mensajes nuevos.', items: [] }),
    }),
  );

  // 8) /api/push-subscribe — siempre OK (no relevante para tests del chat)
  await page.route('**/api/push-subscribe', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

/**
 * Resetea el estado de los mocks (mensajes acumulados) entre tests.
 */
export function resetMocks() {
  mockMessages.length = 0;
}

