import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getAuthUserId(req: NextRequest): Promise<string | null> {
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
  return user?.id || null;
}

async function getParentForUser(userId: string): Promise<{ family_id: string; parent_id: string } | null> {
  const admin = getSupabaseAdmin();
  const { data: parent } = await admin
    .from('parents')
    .select('id, family_id')
    .eq('auth_user_id', userId)
    .limit(1)
    .maybeSingle();
  if (!parent) return null;
  return { family_id: parent.family_id, parent_id: parent.id };
}

// GET /api/family-data?tables=family,parents,children,events,tasks,messages
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const parentInfo = await getParentForUser(userId);
    if (!parentInfo) {
      return NextResponse.json({ error: 'No family found' }, { status: 404 });
    }
    const { family_id: familyId, parent_id: currentParentId } = parentInfo;

    const tables = req.nextUrl.searchParams.get('tables')?.split(',') || [
      'family', 'parents', 'children', 'events', 'tasks', 'messages',
    ];

    const admin = getSupabaseAdmin();
    const result: Record<string, unknown> = { familyId, currentParentId };

    const queries: Promise<void>[] = [];

    if (tables.includes('family')) {
      queries.push(
        admin.from('families').select('*').eq('id', familyId).single()
          .then(({ data }) => { result.family = data; }) as Promise<void>
      );
    }
    if (tables.includes('parents')) {
      queries.push(
        admin.from('parents').select('*').eq('family_id', familyId)
          .then(({ data }) => { result.parents = data || []; }) as Promise<void>
      );
    }
    if (tables.includes('children')) {
      queries.push(
        admin.from('children').select('*').eq('family_id', familyId)
          .then(({ data }) => { result.children = data || []; }) as Promise<void>
      );
    }
    if (tables.includes('events')) {
      queries.push(
        admin.from('events').select('*').eq('family_id', familyId)
          .order('date_start', { ascending: true })
          .then(({ data }) => { result.events = data || []; }) as Promise<void>
      );
    }
    if (tables.includes('tasks')) {
      queries.push(
        admin.from('tasks').select('*').eq('family_id', familyId)
          .in('status', ['pending', 'in_progress'])
          .order('due_date', { ascending: true })
          .then(({ data }) => { result.tasks = data || []; }) as Promise<void>
      );
    }
    if (tables.includes('medications')) {
      queries.push(
        admin.from('medications').select('*').eq('family_id', familyId)
          .eq('status', 'active')
          .order('start_date', { ascending: true })
          .then(({ data }) => { result.medications = data || []; }) as Promise<void>
      );
    }
    // Routines and routine_exceptions: ambas dependen de la lista de hijos.
    // Usamos un fetch encadenado dentro de la misma promesa para no perder
    // paralelismo con los otros queries.
    if (tables.includes('routines') || tables.includes('routine_exceptions')) {
      const wantRoutines = tables.includes('routines');
      const wantExceptions = tables.includes('routine_exceptions');
      queries.push((async () => {
        const { data: kids } = await admin.from('children').select('id').eq('family_id', familyId);
        const childIds = (kids || []).map(k => k.id);
        if (childIds.length === 0) {
          if (wantRoutines) result.routines = [];
          if (wantExceptions) result.routineExceptions = [];
          return;
        }
        const { data: routines } = await admin.from('routines').select('*').in('child_id', childIds).eq('active', true);
        if (wantRoutines) result.routines = routines || [];
        if (wantExceptions) {
          const routineIds = (routines || []).map(r => r.id);
          if (routineIds.length === 0) {
            result.routineExceptions = [];
          } else {
            const { data: exceptions } = await admin.from('routine_exceptions').select('*').in('routine_id', routineIds);
            result.routineExceptions = exceptions || [];
          }
        }
      })());
    }
    if (tables.includes('messages')) {
      const since = req.nextUrl.searchParams.get('since');
      let query = admin.from('messages').select('*').eq('family_id', familyId);
      if (since) {
        query = query.gt('created_at', since);
      }
      queries.push(
        query
          .order('created_at', { ascending: true })
          .limit(100)
          .then(({ data }) => { result.messages = data || []; }) as Promise<void>
      );
    }

    await Promise.all(queries);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
