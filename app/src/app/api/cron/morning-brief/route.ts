import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import webpush from 'web-push';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:nanny@app.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

/**
 * Morning brief cron — corre cada hora en horarios "matutinos" y dispara un
 * brief por familia cuando es ~8am en su zona horaria local.
 *
 * Por simplicidad inicial, todas las familias se asumen en GMT-3 (Argentina/Mexico
 * core). Cuando se agregue `family.timezone`, este cron filtra por TZ.
 *
 * Para evitar duplicados en el mismo día, se chequea que la familia no tenga
 * un mensaje de Nanny con metadata.brief = true creado hoy.
 */
export async function GET(req: NextRequest) {
  // Auth: Vercel Cron envía x-vercel-cron, o usar CRON_SECRET en el query.
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get('x-vercel-cron');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (cronSecret && !headerSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: families, error } = await admin
    .from('families')
    .select('id, name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const todayStart = startOfTodayIsoUtc();
  let processed = 0;
  let sent = 0;

  for (const fam of families || []) {
    // Skip if a brief already went out today for this family.
    const { data: alreadyBriefed } = await admin
      .from('messages')
      .select('id')
      .eq('family_id', fam.id)
      .eq('sender_type', 'nanny')
      .filter('metadata->>brief', 'eq', 'true')
      .gte('created_at', todayStart)
      .limit(1)
      .maybeSingle();

    if (alreadyBriefed) continue;

    const brief = await buildBriefForFamily(fam.id);
    if (!brief) continue;

    await admin.from('messages').insert({
      family_id: fam.id,
      sender_id: null,
      sender_type: 'nanny',
      content: brief,
      message_type: 'reminder',
      metadata: { intent: 'CHAT', brief: true, proactive: true },
    });
    processed++;

    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, keys_p256dh, keys_auth')
        .eq('family_id', fam.id);

      const payload = JSON.stringify({
        title: 'Nanny — Hoy',
        body: brief.length > 120 ? brief.slice(0, 117) + '…' : brief,
        tag: `nanny-brief-${fam.id}-${todayStart}`,
        url: '/chat',
      });

      await Promise.allSettled(
        (subs || []).map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
              payload
            );
            sent++;
          } catch {
            // ignore per-subscription failure
          }
        })
      );
    }
  }

  return NextResponse.json({ ok: true, families: families?.length || 0, processed, pushed: sent });
}

function startOfTodayIsoUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function buildBriefForFamily(familyId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [{ data: events }, { data: meds }, { data: tasks }] = await Promise.all([
    admin
      .from('events')
      .select('title, date_start, child_id, assigned_to')
      .eq('family_id', familyId)
      .gte('date_start', today.toISOString())
      .lt('date_start', tomorrow.toISOString())
      .order('date_start', { ascending: true }),
    admin
      .from('medications')
      .select('medication_name, child_name, schedule_times')
      .eq('family_id', familyId)
      .eq('status', 'active'),
    admin
      .from('tasks')
      .select('title, due_date')
      .eq('family_id', familyId)
      .eq('status', 'pending')
      .or(`due_date.is.null,due_date.lt.${tomorrow.toISOString()}`)
      .limit(5),
  ]);

  const hasContent = (events?.length || 0) + (meds?.length || 0) + (tasks?.length || 0) > 0;
  if (!hasContent) return null;

  const lines: string[] = [];
  lines.push('Buenos días.');

  if (events && events.length > 0) {
    const evLines = events.map((e: { title: string; date_start: string }) => {
      const t = new Date(e.date_start);
      const time = t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `• ${time} ${e.title}`;
    });
    lines.push('Hoy:');
    lines.push(...evLines);
  } else {
    lines.push('Sin eventos agendados para hoy.');
  }

  if (meds && meds.length > 0) {
    const medLines = meds
      .filter((m: { schedule_times?: string[] }) => m.schedule_times && m.schedule_times.length > 0)
      .map((m: { medication_name: string; child_name: string; schedule_times?: string[] }) => `• ${m.medication_name} (${m.child_name}) ${m.schedule_times!.join(', ')}`);
    if (medLines.length > 0) {
      lines.push('Medicación:');
      lines.push(...medLines);
    }
  }

  if (tasks && tasks.length > 0) {
    lines.push(`Tareas pendientes: ${tasks.length}.`);
  }

  return lines.join('\n');
}
