import type { BrowserContext, Page } from '@playwright/test';
import { AUTH_USER_ID, FAMILY_ID, getFamilyDataResponse, mockMessages } from './family';
import { pickResponse } from './responses';
import type { Message } from '../../src/lib/types';

/**
 * Genera un JWT estructuralmente válido (no firmado, pero parseable por
 * supabase-js). Necesario porque la lib decodifica el token localmente
 * y rechaza los inválidos sin hacer llamada HTTP.
 *
 * Payload: user `auth-user-001` con expiración bien lejos en el futuro.
 */
function fakeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: AUTH_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@nanny.test',
      exp: 9999999999,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

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
  await setupAuthCookie(page.context());

  // 1) Supabase Auth — fallback si la lib hace llamadas HTTP a auth
  await page.route(/supabase\.co\/auth\/v1\/(user|token).*/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: AUTH_USER_ID,
        aud: 'authenticated',
        email: 'test@nanny.test',
        user_metadata: {},
        app_metadata: {},
      }),
    }),
  );

  // Cualquier otra llamada Supabase REST: 200 vacío
  await page.route(/supabase\.co\/rest\/v1\/.*/, (route) =>
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

/**
 * Setea la cookie de sesión de @supabase/ssr en el contexto del browser.
 * Hay que llamar esto ANTES de cargar la app para que getUser() devuelva
 * el user fake en lugar de redirigir a /login.
 *
 * El formato de la cookie sigue el de @supabase/ssr v0.5+: un JSON con la
 * sesión completa (access_token + refresh_token + user) bajo el nombre
 * sb-<projectRef>-auth-token. ProjectRef se extrae del subdomain del URL
 * de Supabase (en tests: "dummy" porque NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co).
 */
async function setupAuthCookie(context: BrowserContext) {
  const access = fakeJwt();
  const session = {
    access_token: access,
    refresh_token: 'fake-refresh-token',
    expires_at: 9999999999,
    expires_in: 9999999999,
    token_type: 'bearer',
    user: {
      id: AUTH_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@nanny.test',
      app_metadata: {},
      user_metadata: {},
    },
  };
  // @supabase/ssr usa este formato base64-prefijado para la cookie
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');

  await context.addCookies([
    {
      name: 'sb-dummy-auth-token',
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: 9999999999,
    },
  ]);
}
