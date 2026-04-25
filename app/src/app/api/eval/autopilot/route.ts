import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import {
  processUntilBudget,
  getLatestJobStatus,
  findRunningJob,
} from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;

const CODE_VERSION = 'v7-chain';

// ─── Ensure table exists ───
let tableVerified = false;
async function ensureTable() {
  if (tableVerified) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('autopilot_jobs').select('id').limit(1);

  if (error?.code === '42P01') {
    throw new Error(
      'Table autopilot_jobs no existe. Ejecuta el SQL de supabase/migrations/20260408_autopilot_jobs.sql en el dashboard de Supabase.',
    );
  }

  tableVerified = true;
}

// ─── GET: Return current job status ───
export async function GET() {
  try {
    await ensureTable();
    const status = await getLatestJobStatus();
    if (!status.job) {
      return NextResponse.json({ active: false, _v: CODE_VERSION });
    }
    return NextResponse.json({ ...status, _v: CODE_VERSION });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}

// ─── DELETE: Cancel a running job ───
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    const sb = getSupabaseAdmin();
    await sb.from('autopilot_jobs').update({
      status: 'error',
      message: 'Cancelado por el usuario',
      updated_at: new Date().toISOString(),
    }).eq('id', body.jobId).eq('status', 'running');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── POST: Start a new autopilot job ───
// Creates the job in DB and processes one batch inline (~45s).
// An external cron service (cron-job.org) calls /api/cron/autopilot every
// minute to continue processing server-side until the job completes.
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const sb = getSupabaseAdmin();

    // Cancel all running jobs older than 30 minutes.
    const expiryAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await sb.from('autopilot_jobs')
      .update({
        status: 'error',
        message: 'Expirado automáticamente (>30 min sin completar).',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'running')
      .lt('created_at', expiryAgo);

    const existing = await findRunningJob();

    if (existing) {
      if (force) {
        await sb.from('autopilot_jobs').update({
          status: 'error',
          message: 'Reemplazado por nueva ejecución.',
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        return NextResponse.json(
          { error: 'Ya hay un autopilot en ejecución', jobId: existing.id },
          { status: 409 },
        );
      }
    }

    const jobId = crypto.randomUUID();
    const { error } = await sb.from('autopilot_jobs').insert({
      id: jobId,
      status: 'running',
      phase: 'evaluation',
      current_conversation: 0,
      total_conversations: allConversations.length,
      message: `Evaluando conversación 1/${allConversations.length}...`,
      conversation_scores: [],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[autopilot] created job ${jobId}, processing first batch inline`);

    try {
      await processUntilBudget(jobId, 45_000);
    } catch (e) {
      console.error('[autopilot] first batch error:', e);
      await sb.from('autopilot_jobs').update({
        status: 'error',
        message: `Error: ${e instanceof Error ? e.message : 'Error'}`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    const status = await getLatestJobStatus();
    return NextResponse.json({ started: true, jobId, ...status, _v: CODE_VERSION });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}
