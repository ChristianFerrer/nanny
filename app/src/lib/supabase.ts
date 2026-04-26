import { createBrowserClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Mock parcial de Supabase para E2E tests. Solo implementa los métodos
 * que la app llama desde el browser. Activado vía NEXT_PUBLIC_E2E_TEST_MODE.
 *
 * El resto de las llamadas (REST API, /api/*) las interceptan los tests
 * Playwright via page.route() — ver app/tests/fixtures/mockApis.ts.
 */
function createE2EMockClient(): SupabaseClient {
  const fakeUser = {
    id: 'auth-user-001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@nanny.test',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  // Mock parcial; solo lo que la app usa desde el browser (auth.getUser, signOut)
  return {
    auth: {
      getUser: async () => ({ data: { user: fakeUser }, error: null }),
      getSession: async () => ({
        data: {
          session: {
            access_token: 'fake-token',
            user: fakeUser,
            refresh_token: 'fake-refresh',
            expires_at: 9999999999,
            expires_in: 9999999999,
            token_type: 'bearer',
          },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as unknown as SupabaseClient;
}

// Cliente público (para el navegador, respeta RLS) — singleton
// Usa @supabase/ssr para manejar cookies automáticamente
let _supabase: SupabaseClient;
export function getSupabase() {
  if (!_supabase) {
    if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') {
      _supabase = createE2EMockClient();
    } else {
      _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
  }
  return _supabase;
}

// Cliente admin (solo para server-side: API routes, server actions)
// Bypassa RLS — usar solo en el backend
let _supabaseAdmin: SupabaseClient;
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _supabaseAdmin;
}
