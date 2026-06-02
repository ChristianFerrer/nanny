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

    const admin = getSupabaseAdmin();

    // 1) Already linked to some family? Idempotente — nunca lo movemos.
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
      return NextResponse.json({
        success: true,
        familyId: existingParent.family_id,
        parentId: existingParent.id,
        alreadyMember: true,
      });
    }

    // Resolución del familyId a unir, en orden de confiabilidad:
    //   1) el que manda el cliente (link de invitación),
    //   2) la invitación guardada en la metadata del usuario al registrarse,
    //   3) un slot sin vincular cuyo `email` coincide con el del usuario
    //      (invitación por correo — funciona sin link ni localStorage).
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let familyId: string | undefined = typeof body.familyId === 'string' ? body.familyId : undefined;

    if (!familyId) {
      const metaFam = (user.user_metadata as Record<string, unknown> | undefined)?.pending_family_id;
      if (typeof metaFam === 'string' && metaFam) familyId = metaFam;
    }

    if (!familyId && user.email) {
      const { data: emailSlot } = await admin
        .from('parents')
        .select('family_id')
        .eq('email', user.email.toLowerCase())
        .is('auth_user_id', null)
        .limit(1)
        .maybeSingle();
      if (emailSlot?.family_id) familyId = emailSlot.family_id;
    }

    if (!familyId) {
      return NextResponse.json({ error: 'Falta el ID de familia', code: 'MISSING_FAMILY_ID' }, { status: 400 });
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

    // 3) Look for an unlinked parent slot in this family. Si hay uno etiquetado
    //    con el email de este usuario (invitación por correo), preferimos ese.
    const { data: unlinkedParents, error: unlinkedErr } = await admin
      .from('parents')
      .select('id, name, email')
      .eq('family_id', familyId)
      .is('auth_user_id', null);

    if (unlinkedErr) {
      console.error('join-family: unlinked lookup error:', unlinkedErr);
      return NextResponse.json({ error: unlinkedErr.message, code: 'UNLINKED_LOOKUP_FAILED' }, { status: 500 });
    }

    let unlinkedParent: { id: string; name: string } | null = null;
    if (unlinkedParents && unlinkedParents.length > 0) {
      const emailMatch = user.email
        ? unlinkedParents.find(p => (p.email || '').toLowerCase() === user.email!.toLowerCase())
        : undefined;
      unlinkedParent = emailMatch || unlinkedParents[0];
    }

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
          email: user.email ? user.email.toLowerCase() : null,
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
