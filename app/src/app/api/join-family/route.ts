import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado', code: 'NOT_AUTHENTICATED' }, { status: 401 });
    }

    const { familyId } = await req.json();
    if (!familyId) {
      return NextResponse.json({ error: 'Falta el ID de familia', code: 'MISSING_FAMILY_ID' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // 1) Already linked to some family?
    const { data: existingParent, error: existingErr } = await admin
      .from('parents')
      .select('id, family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error('join-family: existingParent lookup error:', existingErr);
      return NextResponse.json({ error: existingErr.message, code: 'LOOKUP_FAILED' }, { status: 500 });
    }

    if (existingParent) {
      // If linked to the same family, idempotent success.
      // If linked to a *different* family, also success but return the actual family — never silently move them.
      const sameFamily = existingParent.family_id === familyId;
      return NextResponse.json({
        success: true,
        familyId: existingParent.family_id,
        parentId: existingParent.id,
        alreadyMember: true,
        sameFamily,
      });
    }

    // 2) Verify the target family exists
    const { data: family, error: famErr } = await admin
      .from('families')
      .select('id, name')
      .eq('id', familyId)
      .maybeSingle();

    if (famErr) {
      console.error('join-family: family lookup error:', famErr);
      return NextResponse.json({ error: famErr.message, code: 'FAMILY_LOOKUP_FAILED' }, { status: 500 });
    }

    if (!family) {
      return NextResponse.json({ error: 'Familia no encontrada', code: 'FAMILY_NOT_FOUND' }, { status: 404 });
    }

    // 3) Look for an unlinked parent slot in this family (created during onboarding)
    const { data: unlinkedParents, error: unlinkedErr } = await admin
      .from('parents')
      .select('id, name')
      .eq('family_id', familyId)
      .is('auth_user_id', null)
      .limit(1);

    if (unlinkedErr) {
      console.error('join-family: unlinked lookup error:', unlinkedErr);
      return NextResponse.json({ error: unlinkedErr.message, code: 'UNLINKED_LOOKUP_FAILED' }, { status: 500 });
    }

    const unlinkedParent = unlinkedParents && unlinkedParents.length > 0 ? unlinkedParents[0] : null;

    let linkedParentId: string;

    if (unlinkedParent) {
      const { error: updateErr } = await admin
        .from('parents')
        .update({ auth_user_id: user.id })
        .eq('id', unlinkedParent.id)
        .is('auth_user_id', null); // belt-and-suspenders against race
      if (updateErr) {
        console.error('join-family: link update error:', updateErr);
        return NextResponse.json({ error: updateErr.message, code: 'LINK_FAILED' }, { status: 500 });
      }
      linkedParentId = unlinkedParent.id;
    } else {
      const emailName = user.email?.split('@')[0] || 'Padre';
      const name = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      const { data: created, error: insertErr } = await admin
        .from('parents')
        .insert({
          family_id: familyId,
          name,
          role: 'papa',
          avatar_emoji: 'papa',
          auth_user_id: user.id,
        })
        .select('id')
        .single();
      if (insertErr || !created) {
        console.error('join-family: parent insert error:', insertErr);
        return NextResponse.json({ error: insertErr?.message || 'Insert failed', code: 'INSERT_FAILED' }, { status: 500 });
      }
      linkedParentId = created.id;
    }

    return NextResponse.json({
      success: true,
      familyId: family.id,
      parentId: linkedParentId,
    });
  } catch (error) {
    console.error('Join family error:', error);
    return NextResponse.json({ error: 'Error interno del servidor', code: 'UNEXPECTED' }, { status: 500 });
  }
}
