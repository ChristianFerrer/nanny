import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const globalForSupabase = globalThis as unknown as {
  supabase: SupabaseClient | undefined;
  supabaseAdmin: SupabaseClient | undefined;
};

// Cliente público (para el navegador, respeta RLS) — singleton
export const supabase =
  globalForSupabase.supabase ??
  createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase;
}

// Cliente admin (solo para server-side: API routes, server actions)
// Bypassa RLS — usar solo en el backend
export const supabaseAdmin =
  globalForSupabase.supabaseAdmin ??
  createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseAdmin = supabaseAdmin;
}
