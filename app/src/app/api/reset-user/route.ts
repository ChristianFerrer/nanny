import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/reset-user — Deletes all data for a given email (for testing only)
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Find auth user by email
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return NextResponse.json({ error: 'User not found', email }, { status: 404 });
    }

    // Find parent record to get family_id
    const { data: parent } = await admin
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();

    const deleted: string[] = [];

    if (parent?.family_id) {
      const fid = parent.family_id;

      // Delete in order (respect foreign keys)
      const tables = [
        'intervention_feedback',
        'messages',
        'routines',
        'events',
        'tasks',
        'children',
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

    // Delete auth user
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);

    return NextResponse.json({
      success: true,
      userId: user.id,
      familyId: parent?.family_id || null,
      deletedTables: deleted,
      authUserDeleted: !deleteUserError,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
