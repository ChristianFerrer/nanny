import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente público (para el navegador, respeta RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin (solo para server-side: API routes, server actions)
// Bypassa RLS — usar solo en el backend
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
