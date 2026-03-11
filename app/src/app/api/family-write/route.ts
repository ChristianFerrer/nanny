import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

const ALLOWED_TABLES = ['families', 'parents', 'children', 'events', 'tasks', 'messages', 'routines'];

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
    .single();

  if (!parent) return null;
  return { userId: user.id, familyId: parent.family_id };
}

// POST /api/family-write
// Body: { table, operation: 'insert'|'update'|'delete', data?, id?, filters? }
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthFamilyId(req);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { table, operation, data, id } = await req.json();

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    if (operation === 'insert') {
      const insertData = { ...data, id: data.id || crypto.randomUUID(), created_at: data.created_at || new Date().toISOString() };
      // Scope to family
      if (table !== 'families') {
        insertData.family_id = insertData.family_id || auth.familyId;
      }
      const { data: result, error } = await admin.from(table).insert(insertData).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: result });
    }

    if (operation === 'update') {
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      // For families, scope by id matching familyId
      let query = admin.from(table).update(data).eq('id', id);
      if (table === 'families') {
        query = query.eq('id', auth.familyId);
      } else {
        query = query.eq('family_id', auth.familyId);
      }
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (operation === 'delete') {
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const { error } = await admin.from(table).delete().eq('id', id).eq('family_id', auth.familyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
