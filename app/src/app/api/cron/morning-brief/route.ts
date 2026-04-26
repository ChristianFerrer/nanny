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

// Hora local en la zona horaria de cada familia a la que se dispara el brief.
// Si querés cambiarlo a otro horario o hacerlo configurable por familia, pasarlo
// a una columna en `families`.
const BRIEF_HOUR_LOCAL = 8;

/**
 * Morning brief cron — diseñado para correr CADA HORA (cron-job.org con
 * schedule `0 * * * *`). En cada invocación:
 *   1. Itera todas las familias.
 *   2. Para cada una, calcula la hora actual EN SU ZONA HORARIA.
 *   3. Si la hora local es BRIEF_HOUR_LOCAL (8am por default) y todavía no
 *      hubo brief en las últimas 22h, genera el brief.
 *
 * Esto soporta múltiples zonas horarias sin necesidad de tantos crons como
 * zonas. Una sola invocación horaria cubre todas las familias.
 */
export async function GET(req: NextRequest) {
  // Auth: cron-job.org dispara con `?secret=...` o header `x-cron-secret`.
  // Vercel Cron usaría `x-vercel-cron`. Aceptamos los tres.
  const cronSecret = process.env.CRON_SECRET;
  const headerVercel = req.headers.get('x-vercel-cron');
  const headerCustom = req.headers.get('x-cron-secret');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (cronSecret && !headerVercel && headerCustom !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: families, error } = await admin
    .from('families')
    .select('id, name, timezone');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cutoff de 22 horas atrás para deduplicación: si ya hubo brief en las
  // últimas 22h, skip. Un brief diario a las 8am no se va a colisionar con
  // este margen (mínimo 24h entre briefs ≥ 22h cutoff).
  const recentCutoff = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();

  let dueCount = 0;
  let processed = 0;
  let pushed = 0;

  for (const fam of families || []) {
    const tz = fam.timezone || 'America/Argentina/Buenos_Aires';
    const localHour = currentHourInTz(tz);
    if (localHour !== BRIEF_HOUR_LOCAL) continue;
    dueCount++;

    // Skip si ya hubo brief reciente
    const { data: alreadyBriefed } = await admin
      .from('messages')
      .select('id')
      .eq('family_id', fam.id)
      .eq('sender_type', 'nanny')
      .filter('metadata->>brief', 'eq', 'true')
      .gte('created_at', recentCutoff)
      .limit(1)
      .maybeSingle();

    if (alreadyBriefed) continue;

    const brief = await buildBriefForFamily(fam.id, tz);
    if (!brief) continue;

    await admin.from('messages').insert({
      family_id: fam.id,
      sender_id: null,
      sender_type: 'nanny',
      content: brief,
      message_type: 'reminder',
      metadata: { intent: 'CHAT', brief: true, proactive: true, timezone: tz },
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
        tag: `nanny-brief-${fam.id}-${todayKeyInTz(tz)}`,
        url: '/chat',
      });

      await Promise.allSettled(
        (subs || []).map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
              payload
            );
            pushed++;
          } catch {
            // ignore per-subscription failure
          }
        })
      );
    }
  }

  return NextResponse.json({
    ok: true,
    families: families?.length || 0,
    dueAtThisHour: dueCount,
    briefsSent: processed,
    pushNotified: pushed,
  });
}

function currentHourInTz(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    return parseInt(fmt.format(new Date()), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

function todayKeyInTz(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function buildBriefForFamily(familyId: string, tz: string): Promise<string | null> {
  const admin = getSupabaseAdmin();

  // Computar "hoy" y "mañana" en UTC tomando como referencia el día local
  // de la familia (00:00 a 23:59:59 en su TZ).
  const { todayStartUtc, tomorrowStartUtc } = dayBoundsInTz(tz);

  const [{ data: events }, { data: meds }, { data: tasks }] = await Promise.all([
    admin
      .from('events')
      .select('title, date_start, child_id, assigned_to')
      .eq('family_id', familyId)
      .gte('date_start', todayStartUtc)
      .lt('date_start', tomorrowStartUtc)
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
      .or(`due_date.is.null,due_date.lt.${tomorrowStartUtc}`)
      .limit(5),
  ]);

  const hasContent = (events?.length || 0) + (meds?.length || 0) + (tasks?.length || 0) > 0;
  if (!hasContent) return null;

  const lines: string[] = [];
  lines.push('Buenos días.');

  if (events && events.length > 0) {
    const evLines = events.map((e: { title: string; date_start: string }) => {
      const time = formatTimeInTz(e.date_start, tz);
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
      .map((m: { medication_name: string; child_name: string; schedule_times?: string[] }) =>
        `• ${m.medication_name} (${m.child_name}) ${m.schedule_times!.join(', ')}`
      );
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

/**
 * Devuelve el inicio del día actual y del día siguiente EN UTC tomando como
 * referencia el día local de la zona horaria pasada. Útil para queries por
 * `created_at`/`date_start` que están en UTC.
 */
function dayBoundsInTz(tz: string): { todayStartUtc: string; tomorrowStartUtc: string } {
  const todayLocal = todayKeyInTz(tz); // YYYY-MM-DD en la TZ
  // Truco: construir un Date en UTC con esa fecha y descontar el offset de TZ.
  // Como Intl no expone offset directo, usamos un round-trip vía DateTimeFormat con timeZoneName.
  const offsetMinutes = tzOffsetMinutes(tz);
  const todayUtcMs = Date.UTC(
    parseInt(todayLocal.slice(0, 4), 10),
    parseInt(todayLocal.slice(5, 7), 10) - 1,
    parseInt(todayLocal.slice(8, 10), 10),
    0, 0, 0
  );
  // El "00:00 local" en UTC = 00:00 UTC del mismo Y/M/D + offset.
  const todayStartMs = todayUtcMs - offsetMinutes * 60 * 1000;
  const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1000;
  return {
    todayStartUtc: new Date(todayStartMs).toISOString(),
    tomorrowStartUtc: new Date(tomorrowStartMs).toISOString(),
  };
}

function tzOffsetMinutes(tz: string): number {
  try {
    // Para una fecha dada, formatear en UTC y en la TZ destino y comparar.
    const now = new Date();
    const utcParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const tzParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const utcMs = partsToUtcMs(utcParts);
    const tzMs = partsToUtcMs(tzParts);
    return Math.round((tzMs - utcMs) / 60000); // ej. ART = -180
  } catch {
    return 0;
  }
}

function partsToUtcMs(parts: Intl.DateTimeFormatPart[]): number {
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

function formatTimeInTz(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
