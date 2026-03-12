import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:nanny@app.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function POST(req: NextRequest) {
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }

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

    const { familyId, title, body, senderParentId } = await req.json();
    if (!familyId || !body) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Get all push subscriptions for this family EXCEPT the sender
    const query = admin
      .from('push_subscriptions')
      .select('*')
      .eq('family_id', familyId);

    if (senderParentId) {
      query.neq('parent_id', senderParentId);
    }

    const { data: subscriptions } = await query;

    if (!subscriptions?.length) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title: title || 'Nanny',
      body,
      tag: `nanny-${Date.now()}`,
      url: '/chat',
    });

    let sent = 0;
    const expired: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
            },
            payload
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            expired.push(sub.endpoint);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await admin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expired);
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error('Push notify error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
