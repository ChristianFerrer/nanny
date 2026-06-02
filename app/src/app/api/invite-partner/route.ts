import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

// Invitar a la pareja por correo. El invitador (autenticado) asocia el email de
// su pareja a un "slot" de parent sin vincular en su familia. Cuando esa persona
// cree su cuenta con ese correo, /api/join-family o /api/onboarding la matchean
// por email y la unen automáticamente a la familia — sin depender del link.
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado', code: 'NOT_AUTHENTICATED' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido', code: 'INVALID_EMAIL' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Familia del invitador
    const { data: inviter, error: invErr } = await admin
      .from('parents')
      .select('id, family_id, role')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (invErr) {
      console.error('invite-partner: inviter lookup error:', invErr);
      return NextResponse.json({ error: invErr.message, code: 'LOOKUP_FAILED' }, { status: 500 });
    }
    if (!inviter?.family_id) {
      return NextResponse.json({ error: 'No perteneces a una familia', code: 'NO_FAMILY' }, { status: 400 });
    }

    // No tiene sentido invitarte a vos mismo.
    if (user.email && user.email.toLowerCase() === email) {
      return NextResponse.json({ error: 'Ese es tu propio correo', code: 'SELF_INVITE' }, { status: 400 });
    }

    // Si ese correo ya está vinculado a un parent en esta familia, ya es miembro.
    const { data: alreadyLinked } = await admin
      .from('parents')
      .select('id')
      .eq('family_id', inviter.family_id)
      .eq('email', email)
      .not('auth_user_id', 'is', null)
      .limit(1);
    if (alreadyLinked && alreadyLinked.length > 0) {
      return NextResponse.json({ success: true, familyId: inviter.family_id, alreadyMember: true });
    }

    // Etiquetar un slot sin vincular con el email; si no hay, crear uno.
    const { data: unlinked } = await admin
      .from('parents')
      .select('id')
      .eq('family_id', inviter.family_id)
      .is('auth_user_id', null)
      .limit(1);

    if (unlinked && unlinked.length > 0) {
      const { error: updErr } = await admin
        .from('parents')
        .update({ email })
        .eq('id', unlinked[0].id);
      if (updErr) {
        console.error('invite-partner: slot update error:', updErr);
        return NextResponse.json({ error: updErr.message, code: 'UPDATE_FAILED' }, { status: 500 });
      }
    } else {
      const role = inviter.role === 'mama' ? 'papa' : 'mama';
      const { error: insErr } = await admin
        .from('parents')
        .insert({ family_id: inviter.family_id, name: 'Tu pareja', role, avatar_emoji: role, email });
      if (insErr) {
        console.error('invite-partner: slot insert error:', insErr);
        return NextResponse.json({ error: insErr.message, code: 'INSERT_FAILED' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, familyId: inviter.family_id });
  } catch (error) {
    console.error('invite-partner error:', error);
    return NextResponse.json({ error: 'Error interno del servidor', code: 'UNEXPECTED' }, { status: 500 });
  }
}
