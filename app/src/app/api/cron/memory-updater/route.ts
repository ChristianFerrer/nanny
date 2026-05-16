/**
 * /api/cron/memory-updater — Memory Engine daily updater (Sprint 2).
 *
 * Cron-job.org dispara este endpoint UNA vez por día a las 03:00 UTC
 * (`0 3 * * *`). En cada invocación:
 *   1. Itera todas las familias elegibles (filtro por
 *      USE_NEW_PIPELINE_FAMILY_IDS — mismo cutover progresivo que el
 *      decision agent).
 *   2. Por cada una corre el memory updater: arma contexto 24h + patrones
 *      actuales, invoca Claude Sonnet 4.6 con prompt caching, aplica las
 *      operaciones devueltas sobre family_patterns y family_learning_queue.
 *   3. Devuelve summary agregado.
 *
 * Auth: igual que el resto de los crons (CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { runMemoryUpdaterForFamily } from '@/lib/agent/memory-updater';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth
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
    .select('id, name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allowed = parseAllowedFamilyIds(process.env.USE_NEW_PIPELINE_FAMILY_IDS);
  const eligible = (families || []).filter(f => allowed === null || allowed.has(f.id));

  const results = [];
  let costTotal = 0;
  let opsTotal = 0;

  for (const fam of eligible) {
    const r = await runMemoryUpdaterForFamily(fam.id);
    if (!r) {
      results.push({ family_id: fam.id, status: 'context_failed' });
      continue;
    }
    results.push({ status: r.error ? 'error' : 'ok', ...r });
    costTotal += r.cost_usd;
    opsTotal += r.operations_applied;
  }

  return NextResponse.json({
    ok: true,
    families_total: families?.length || 0,
    families_eligible: eligible.length,
    operations_total: opsTotal,
    cost_total_usd: Math.round(costTotal * 1_000_000) / 1_000_000,
    results,
  });
}

function parseAllowedFamilyIds(raw: string | undefined): Set<string> | null {
  if (!raw || raw.trim().length === 0) return null;
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return new Set(ids);
}
