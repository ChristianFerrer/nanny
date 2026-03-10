import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente público (para el navegador, respeta RLS) — singleton
let _supabase: SupabaseClient;
export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}
// Default export for backward compatibility
export const supabase = getSupabase();

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
// Lazy — only created when accessed from server-side code
export const supabaseAdmin = typeof window === 'undefined' ? getSupabaseAdmin() : (null as unknown as SupabaseClient);
