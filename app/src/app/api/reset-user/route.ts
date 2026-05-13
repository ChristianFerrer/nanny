import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/reset-user — Borra TODOS los datos del usuario autenticado.
 *
 * Auth: requiere cookies de Supabase (usuario logueado). Borra solo SU
 * familia, sus hijos, sus mensajes, sus rutinas y eventos. Después
 * elimina el usuario de auth. Equivalente a "empezar de cero con el
 * mismo email".
 *
 * NO acepta un email como parameter — eso era un agujero: cualquiera
 * con el email podía wipear esa cuenta. Ahora la fuente de verdad es
 * la sesión.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Find parent record to get family_id
    const { data: parent } = await admin
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle();

    const deleted: string[] = [];

    if (parent?.family_id) {
      const fid = parent.family_id;

      // Orden importa: hijos antes de padres, hijas antes de padres (FK).
      // Routines y routine_exceptions cascade vía child_id ON DELETE CASCADE.
      // Medication_intakes cascade vía medication_id.
      const tables = [
        'intervention_feedback',
        'messages',
        'notifications_sent',
        'medications',
        'events',
        'tasks',
        'children', // cascade → routines, routine_exceptions
        'parents',
      ];

      for (const table of tables) {
        const { error } = await admin.from(table).delete().eq('family_id', fid);
        if (!error) deleted.push(table);
      }

      // Delete family
      const { error: famError } = await admin.from('families').delete().eq('id', fid);
      if (!famError) deleted.push('families');
    }

    // Delete auth user al final
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);

    return NextResponse.json({
      success: true,
      userId: user.id,
      familyId: parent?.family_id || null,
      deletedTables: deleted,
      authUserDeleted: !deleteUserError,
    });
  } catch (err) {
    console.error('[reset-user] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
