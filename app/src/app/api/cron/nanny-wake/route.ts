/**
 * /api/cron/nanny-wake — Decision Agent trigger.
 *
 * Despertador del decision agent (Sprint 1). Pensado para correr CADA 15
 * MINUTOS (cron-job.org con schedule `*​/15 * * * *`). En cada invocación:
 *
 *   1. Itera todas las familias activas.
 *   2. Para cada una calcula la hora local en su timezone.
 *   3. Si la hora local está dentro de ±15 min de uno de los 4 momentos del
 *      reloj semántico (07:00, 12:30, 17:00, 21:00), corre el decision
 *      agent con trigger_type='scheduled' + trigger_moment.
 *   4. Dedup: si ya hubo despertar para ese mismo momento en las últimas
 *      4h, skip — evita doble-disparo cuando el cron se traslapa con la
 *      ventana de tolerancia.
 *   5. Si la decisión es intervenir → escribe en chat. Si no, solo loguea.
 *
 * NANNY-VISION.md §6.1 define los 4 momentos. La tolerancia ±15 min vino
 * en el prompt de Sprint 1 (acordada explícitamente).
 *
 * Auth: igual que otros crons — query param `?secret=<CRON_SECRET>` o
 *       header `x-cron-secret: <CRON_SECRET>` o header `x-vercel-cron`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { runDecisionAgent } from '@/lib/agent/decision-agent';
import type { DecisionAgentMoment } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Momentos fijos del reloj semántico (NANNY-VISION §6.1).
// minutes = hour*60 + minute en hora local de la familia.
const MOMENTS: { key: DecisionAgentMoment; minutes: number; label: string }[] = [
  { key: 'morning',   minutes: 7 * 60,             label: '07:00' },
  { key: 'midday',    minutes: 12 * 60 + 30,       label: '12:30' },
  { key: 'afternoon', minutes: 17 * 60,            label: '17:00' },
  { key: 'evening',   minutes: 21 * 60,            label: '21:00' },
];

const TOLERANCE_MIN = 15; // ±15 min alrededor de cada momento
const DEDUP_HOURS = 4;    // ventana de dedup por (familia, momento)

export async function GET(req: NextRequest) {
  // ── Auth
  const url = new URL(req.url);
  const secretFromQuery = url.searchParams.get('secret');
  const secretFromHeader = req.headers.get('x-cron-secret');
  const isVercelCron = req.headers.get('x-vercel-cron') !== null;
  const validSecret = process.env.CRON_SECRET;
  if (
    !isVercelCron &&
    validSecret &&
    secretFromQuery !== validSecret &&
    secretFromHeader !== validSecret
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: families, error } = await admin
    .from('families')
    .select('id, name, timezone');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Filtro por env var: si USE_NEW_PIPELINE_FAMILY_IDS está seteada,
  // solo despertamos para esas familias. Esto deja el cutover progresivo
  // controlado (Sprint 3 lo abre para todos).
  const allowed = parseAllowedFamilyIds(process.env.USE_NEW_PIPELINE_FAMILY_IDS);
  const eligible = (families || []).filter(f => allowed === null || allowed.has(f.id));

  const now = new Date();
  const dedupCutoffIso = new Date(now.getTime() - DEDUP_HOURS * 60 * 60 * 1000).toISOString();

  const results: Array<{
    family_id: string;
    moment: DecisionAgentMoment | null;
    status: 'fired' | 'dedup' | 'no_moment' | 'context_failed' | 'error';
    intervened?: boolean;
    cost_usd?: number;
    latency_ms?: number;
    log_id?: string | null;
    error?: string;
  }> = [];

  for (const fam of eligible) {
    const tz: string = fam.timezone || 'UTC';
    const localMinutes = currentLocalMinutes(now, tz);
    const matched = matchMoment(localMinutes);

    if (!matched) {
      results.push({ family_id: fam.id, moment: null, status: 'no_moment' });
      continue;
    }

    // Dedup: ¿ya hubo scheduled wake para este moment en las últimas 4h?
    const { data: recent } = await admin
      .from('decision_agent_log')
      .select('id')
      .eq('family_id', fam.id)
      .eq('trigger_type', 'scheduled')
      .eq('trigger_moment', matched.key)
      .gte('created_at', dedupCutoffIso)
      .limit(1)
      .maybeSingle();

    if (recent) {
      results.push({ family_id: fam.id, moment: matched.key, status: 'dedup' });
      continue;
    }

    try {
      const r = await runDecisionAgent({
        familyId: fam.id,
        trigger_type: 'scheduled',
        trigger_moment: matched.key,
      });
      if (!r) {
        results.push({ family_id: fam.id, moment: matched.key, status: 'context_failed' });
        continue;
      }
      results.push({
        family_id: fam.id,
        moment: matched.key,
        status: 'fired',
        intervened: r.decision.intervene,
        cost_usd: r.cost_usd,
        latency_ms: r.latency_ms,
        log_id: r.log_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[nanny-wake] family error', { familyId: fam.id, error: msg });
      results.push({ family_id: fam.id, moment: matched.key, status: 'error', error: msg });
    }
  }

  const summary = summarize(results);
  return NextResponse.json({
    ok: true,
    now_utc: now.toISOString(),
    families_total: families?.length || 0,
    families_eligible: eligible.length,
    ...summary,
    results,
  });
}

function parseAllowedFamilyIds(raw: string | undefined): Set<string> | null {
  if (!raw || raw.trim().length === 0) return null;
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return new Set(ids);
}

function currentLocalMinutes(d: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
    let h = get('hour');
    if (h === 24) h = 0;
    const m = get('minute');
    return h * 60 + m;
  } catch {
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

function matchMoment(localMinutes: number): { key: DecisionAgentMoment; minutes: number; label: string } | null {
  for (const m of MOMENTS) {
    if (Math.abs(localMinutes - m.minutes) <= TOLERANCE_MIN) return m;
  }
  return null;
}

function summarize(results: Array<{ status: string; intervened?: boolean; cost_usd?: number }>) {
  let fired = 0, dedup = 0, noMoment = 0, errored = 0, contextFailed = 0;
  let interventions = 0;
  let costTotal = 0;
  for (const r of results) {
    if (r.status === 'fired') {
      fired++;
      if (r.intervened) interventions++;
      costTotal += r.cost_usd || 0;
    } else if (r.status === 'dedup') dedup++;
    else if (r.status === 'no_moment') noMoment++;
    else if (r.status === 'context_failed') contextFailed++;
    else if (r.status === 'error') errored++;
  }
  return {
    fired,
    dedup,
    no_moment: noMoment,
    context_failed: contextFailed,
    errored,
    interventions,
    cost_total_usd: Math.round(costTotal * 1_000_000) / 1_000_000,
  };
}
