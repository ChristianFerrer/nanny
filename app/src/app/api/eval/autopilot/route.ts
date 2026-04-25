import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import {
  processUntilBudget,
  getLatestJobStatus,
  findRunningJob,
} from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;

const CODE_VERSION = 'v5-polling';

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
// Single source of truth via getLatestJobStatus (handles auto-expiry).
export async function GET() {
  try {
    await ensureTable();
    const status = await getLatestJobStatus();
    if (!status.job) {
      return NextResponse.json({ active: false });
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

// ─── PATCH: Continue processing a running job ───
// Called by the browser's polling loop every ~5s. Processes one chunk of work
// (~45s budget) then returns. This replaces the Vercel Cron approach which
// requires Pro plan for sub-daily schedules.
export async function PATCH() {
  try {
    const job = await findRunningJob();
    if (!job) {
      return NextResponse.json({ idle: true, _v: CODE_VERSION });
    }

    const result = await processUntilBudget(job.id, 45_000);
    const status = await getLatestJobStatus();

    return NextResponse.json({
      ...status,
      _v: CODE_VERSION,
      processed: result.processed,
      finalStatus: result.finalStatus,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}

// ─── POST: Start a new autopilot job ───
// Creates the job in DB and processes ONE conversation inline (~45s) for
// immediate UX feedback. After this returns, the browser's polling loop
// calls PATCH to continue processing until the job completes.
//
// Body: { force?: boolean } — if force=true, cancels any existing running job first.
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const sb = getSupabaseAdmin();

    // Step 1: Cancel all running jobs older than 30 minutes.
    const expiryAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await sb.from('autopilot_jobs')
      .update({
        status: 'error',
        message: 'Expirado automáticamente (>30 min sin completar).',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'running')
      .lt('created_at', expiryAgo);

    // Step 2: Check if there's still a recent running job.
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
