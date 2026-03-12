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

    // Get authenticated user from cookies
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
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { familyId } = await req.json();
    if (!familyId) {
      return NextResponse.json({ error: 'Falta el ID de familia' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Check if user already belongs to a family
    const { data: existingParent } = await admin
      .from('parents')
      .select('id, family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();

    if (existingParent) {
      return NextResponse.json({
        success: true,
        familyId: existingParent.family_id,
        message: 'Ya perteneces a una familia',
      });
    }

    // Verify the family exists
    const { data: family } = await admin
      .from('families')
      .select('id, name')
      .eq('id', familyId)
      .single();

    if (!family) {
      return NextResponse.json({ error: 'Familia no encontrada' }, { status: 404 });
    }

    // Look for an unlinked parent in this family (created during onboarding with null auth_user_id)
    const { data: unlinkedParent } = await admin
      .from('parents')
      .select('id, name')
      .eq('family_id', familyId)
      .is('auth_user_id', null)
      .limit(1)
      .single();

    if (unlinkedParent) {
      // Link the existing unlinked parent to this auth user
      await admin
        .from('parents')
        .update({ auth_user_id: user.id })
        .eq('id', unlinkedParent.id);
    } else {
      // No unlinked parent slot — create a new parent record
      const emailName = user.email?.split('@')[0] || 'Padre';
      const name = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      await admin
        .from('parents')
        .insert({
          family_id: familyId,
          name,
          role: 'papa',
          avatar_emoji: '👨',
          auth_user_id: user.id,
        });
    }

    return NextResponse.json({
      success: true,
      familyId: family.id,
    });
  } catch (error) {
    console.error('Join family error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
