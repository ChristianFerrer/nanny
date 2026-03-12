import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Config missing' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Get parent info
    const { data: parent } = await admin
      .from('parents')
      .select('id, family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();

    if (!parent) {
      return NextResponse.json({ error: 'No se encontró padre' }, { status: 404 });
    }

    // Upsert subscription (replace if same endpoint exists)
    await admin
      .from('push_subscriptions')
      .upsert({
        parent_id: parent.id,
        family_id: parent.family_id,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
