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

// Ventanas de aviso. Eventos: aviso entre 25 y 30 min antes (a 10 min cron tick
// quedan 1-2 ticks de margen). Tomas de medicación: aviso entre 10 y 15 min
// antes — más cerca porque la dosis suele ser más urgente.
const EVENT_LEAD_MIN = 30;
const MEDICATION_LEAD_MIN = 15;

/**
 * Cron de avisos próximos — diseñado para correr cada 10 min en cron-job.org.
 *
 * En cada invocación:
 *   1. Busca eventos con `date_start` entre NOW y NOW+30min sin push previo.
 *   2. Busca tomas de medicación con `scheduled_at` entre NOW y NOW+15min sin
 *      push previo.
 *   3. Para cada hit, envía push a las suscripciones de la familia y registra
 *      en `notifications_sent` (UNIQUE en entity_type+entity_id) para evitar
 *      reenvíos.
 *
 * El criterio de "sin push previo" es vía LEFT JOIN con `notifications_sent`.
 * El cron se puede correr 2 veces seguidas sin generar duplicados gracias al
 * UNIQUE constraint y al filtro previo.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const headerVercel = req.headers.get('x-vercel-cron');
  const headerCustom = req.headers.get('x-cron-secret');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (cronSecret && !headerVercel && headerCustom !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const eventCutoff = new Date(now.getTime() + EVENT_LEAD_MIN * 60 * 1000).toISOString();
  const medCutoff = new Date(now.getTime() + MEDICATION_LEAD_MIN * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  let eventsNotified = 0;
  let intakesNotified = 0;
  let pushesAttempted = 0;
  let pushesSucceeded = 0;

  // ─────────────────────────────────────────────────────────
  // 1. Eventos próximos sin notificar
  // ─────────────────────────────────────────────────────────
  const { data: alreadyEventIds } = await admin
    .from('notifications_sent')
    .select('entity_id')
    .eq('entity_type', 'event');
  const notifiedEventIds = new Set((alreadyEventIds || []).map(r => r.entity_id as string));

  const { data: upcomingEvents } = await admin
    .from('events')
    .select('id, family_id, title, date_start, location')
    .gte('date_start', nowIso)
    .lt('date_start', eventCutoff)
    .in('status', ['pending', 'confirmed']);

  for (const ev of upcomingEvents || []) {
    if (notifiedEventIds.has(ev.id)) continue;
    const minutesAway = Math.round((new Date(ev.date_start).getTime() - now.getTime()) / 60000);
    const sent = await sendPushToFamily(admin, ev.family_id, {
      title: `${ev.title}`,
      body: minutesAway > 0
        ? `En ${minutesAway} min${ev.location ? ` · ${ev.location}` : ''}`
        : `Empieza ahora${ev.location ? ` · ${ev.location}` : ''}`,
      tag: `event-${ev.id}`,
      url: `/evento/${ev.id}`,
    });
    pushesAttempted += sent.attempted;
    pushesSucceeded += sent.succeeded;

    // Registrar el envío incluso si todas las subs fallaron — el evento ya pasó,
    // no queremos re-intentar 10 min después con datos viejos.
    await admin.from('notifications_sent').insert({
      entity_type: 'event',
      entity_id: ev.id,
      family_id: ev.family_id,
    });
    eventsNotified++;
  }

  // ─────────────────────────────────────────────────────────
  // 2. Tomas de medicación próximas sin notificar
  // ─────────────────────────────────────────────────────────
  const { data: alreadyIntakeIds } = await admin
    .from('notifications_sent')
    .select('entity_id')
    .eq('entity_type', 'medication_intake');
  const notifiedIntakeIds = new Set((alreadyIntakeIds || []).map(r => r.entity_id as string));

  const { data: upcomingIntakes } = await admin
    .from('medication_intakes')
    .select('id, family_id, scheduled_at, medication_id, status, medications(medication_name, child_name)')
    .gte('scheduled_at', nowIso)
    .lt('scheduled_at', medCutoff)
    .eq('status', 'pending');

  for (const intake of upcomingIntakes || []) {
    if (notifiedIntakeIds.has(intake.id)) continue;
    const med = (intake as { medications?: { medication_name?: string; child_name?: string } }).medications;
    const minutesAway = Math.round((new Date(intake.scheduled_at).getTime() - now.getTime()) / 60000);
    const sent = await sendPushToFamily(admin, intake.family_id, {
      title: `${med?.medication_name || 'Medicación'}`,
      body: med?.child_name
        ? `${med.child_name} en ${minutesAway} min`
        : `En ${minutesAway} min`,
      tag: `intake-${intake.id}`,
      url: `/agenda`,
    });
    pushesAttempted += sent.attempted;
    pushesSucceeded += sent.succeeded;

    await admin.from('notifications_sent').insert({
      entity_type: 'medication_intake',
      entity_id: intake.id,
      family_id: intake.family_id,
    });
    intakesNotified++;
  }

  return NextResponse.json({
    ok: true,
    eventsNotified,
    intakesNotified,
    pushesAttempted,
    pushesSucceeded,
    leadMinutes: { event: EVENT_LEAD_MIN, medication: MEDICATION_LEAD_MIN },
  });
}

/**
 * Envía un push a todas las suscripciones de una familia. Devuelve cuántas
 * subscripciones se intentaron y cuántas tuvieron éxito. Falla por sub no
 * propaga — un dispositivo dormido no debe romper el batch.
 */
async function sendPushToFamily(
  admin: ReturnType<typeof getSupabaseAdmin>,
  familyId: string,
  payload: { title: string; body: string; tag: string; url: string }
): Promise<{ attempted: number; succeeded: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { attempted: 0, succeeded: 0 };

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, keys_p256dh, keys_auth')
    .eq('family_id', familyId);

  if (!subs || subs.length === 0) return { attempted: 0, succeeded: 0 };

  let succeeded = 0;
  const json = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          json
        );
        succeeded++;
      } catch {
        // Suscripción inválida o sin red — ignorar
      }
    })
  );

  return { attempted: subs.length, succeeded };
}
