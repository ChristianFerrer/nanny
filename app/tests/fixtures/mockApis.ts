import type { Page } from '@playwright/test';
import { FAMILY_ID, getFamilyDataResponse, mockMessages } from './family';
import { pickResponse } from './responses';
import type { Message } from '../../src/lib/types';

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

  // 4) /api/family-data?tables=... → datos según las tablas pedidas
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

  // 5) /api/chat → respuesta determinística según el texto
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { text?: string } | null;
    const text = body?.text || '';
    const response = pickResponse(text);

    // Simulamos un mensaje persistido como respondería el endpoint real
    const nannyMessage: Message = {
      id: `msg-nanny-${Date.now()}`,
      family_id: FAMILY_ID,
      sender_id: null,
      sender_type: 'nanny',
      content: response.reply,
      message_type: 'text',
      metadata: {
        intent: response.intent,
        ...(response.confirmation ? { confirmation_id: 'conf-mock-1' } : {}),
      },
      created_at: new Date().toISOString(),
    };

    mockMessages.push(nannyMessage);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: nannyMessage,
        response: response.reply,
        intent: response.intent,
        confirmation: response.confirmation,
        confirmationId: response.confirmation ? 'conf-mock-1' : null,
      }),
    });
  });

  // 6) /api/family-write → 200 OK con echo del payload
  await page.route('**/api/family-write', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: body }),
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

