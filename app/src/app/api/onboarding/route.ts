import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing env vars:', { url: !!supabaseUrl, serviceKey: !!serviceRoleKey });
      return NextResponse.json({
        error: 'Configuración del servidor incompleta. Falta SUPABASE_SERVICE_ROLE_KEY.'
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { familyName, parents, children, authUserId } = await req.json();

    if (!parents?.length || !children?.length) {
      return NextResponse.json({ error: 'Se necesita al menos un padre y un hijo' }, { status: 400 });
    }

    // Create family
    const { data: family, error: famErr } = await supabase
      .from('families')
      .insert({ name: familyName || 'Mi Familia' })
      .select()
      .single();

    if (famErr || !family) {
      console.error('Family creation error:', famErr);
      return NextResponse.json({ error: 'Error al crear familia: ' + (famErr?.message || 'unknown') }, { status: 500 });
    }

    // Create parents — link the first parent to the authenticated user
    const parentInserts = parents.map((p: { name: string; role: string; avatar_emoji: string; phone?: string }, index: number) => ({
      family_id: family.id,
      name: p.name,
      role: p.role,
      avatar_emoji: p.avatar_emoji || (p.role === 'mama' ? '👩' : '👨'),
      auth_user_id: index === 0 && authUserId ? authUserId : null,
      phone: p.phone || null,
    }));

    const { data: createdParents, error: parErr } = await supabase
      .from('parents')
      .insert(parentInserts)
      .select();

    if (parErr) {
      console.error('Parents creation error:', parErr);
      return NextResponse.json({ error: 'Error al crear padres: ' + parErr.message }, { status: 500 });
    }

    // Create children
    const childInserts = children.map((c: {
      name: string; birth_date: string; emoji: string;
      school: string; teacher: string; grade: string; allergies: string[];
    }) => ({
      family_id: family.id,
      name: c.name,
      birth_date: c.birth_date || null,
      emoji: c.emoji || '👶',
      school: c.school || null,
      teacher: c.teacher || null,
      grade: c.grade || null,
      allergies: c.allergies || [],
    }));

    const { data: createdChildren, error: childErr } = await supabase
      .from('children')
      .insert(childInserts)
      .select();

    if (childErr) {
      console.error('Children creation error:', childErr);
      return NextResponse.json({ error: 'Error al crear hijos: ' + childErr.message }, { status: 500 });
    }

    // Create welcome message from Nanny
    const childNames = createdChildren?.map((c: { name: string }) => c.name).join(' y ') || 'tus hijos';
    await supabase.from('messages').insert({
      family_id: family.id,
      sender_id: null,
      sender_type: 'nanny',
      content: `¡Hola familia! 👋 Soy Nanny, su asistente. Ya conozco a ${childNames}. Escriban aquí como normalmente se coordinan — yo detecto citas, tareas y les ayudo a organizarse. ¿En qué puedo ayudarles?`,
      message_type: 'text',
      metadata: { intent: 'CHAT' },
    });

    return NextResponse.json({
      success: true,
      family_id: family.id,
      parents: createdParents,
      children: createdChildren,
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
