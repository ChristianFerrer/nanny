import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuthFamilyId(req: NextRequest): Promise<{ userId: string; familyId: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() {},
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdmin();
  const { data: parent } = await admin
    .from('parents')
    .select('family_id')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!parent) return null;
  return { userId: user.id, familyId: parent.family_id };
}

// GET /api/medication/[id] -> medication + ordered intakes
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getAuthFamilyId(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: medication, error: medErr } = await admin
    .from('medications')
    .select('*')
    .eq('id', id)
    .eq('family_id', auth.familyId)
    .maybeSingle();

  if (medErr) return NextResponse.json({ error: medErr.message }, { status: 500 });
  if (!medication) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: intakes, error: intErr } = await admin
    .from('medication_intakes')
    .select('*')
    .eq('medication_id', id)
    .eq('family_id', auth.familyId)
    .order('scheduled_at', { ascending: true });

  if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 });

  return NextResponse.json({ medication, intakes: intakes || [] });
}
