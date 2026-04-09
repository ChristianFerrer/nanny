import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import { processUntilBudget } from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;

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
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('autopilot_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ active: false });
    }

    // Auto-expire jobs older than 20 minutes
    if (data.status === 'running') {
      const age = Date.now() - new Date(data.created_at).getTime();
      if (age > 20 * 60 * 1000) {
        await sb.from('autopilot_jobs').update({
          status: 'error',
          message: 'Timeout: el job excedió el tiempo máximo',
          updated_at: new Date().toISOString(),
        }).eq('id', data.id);
        data.status = 'error';
        data.message = 'Timeout: el job excedió el tiempo máximo';
      }
    }

    return NextResponse.json({
      active: data.status === 'running',
      job: data,
    });
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
// Creates the job in DB and processes the first batch inline (~50s) for immediate UX.
// After this returns, the Vercel Cron (every minute) takes over and continues processing
// until the job completes. This runs 100% server-side, independent of browser state.
//
// Body: { force?: boolean } — if force=true, cancels any existing running job first.
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const sb = getSupabaseAdmin();

    // Check for existing running job
    const { data: existing } = await sb
      .from('autopilot_jobs')
      .select('id, updated_at, created_at')
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const createdAge = Date.now() - new Date(existing[0].created_at).getTime();
      const updatedAge = Date.now() - new Date(existing[0].updated_at).getTime();
      // Auto-expire if created >20 min ago OR updated >3 min ago (cron runs every minute, so >3min = stuck)
      // Or if force=true, always replace
      if (force || createdAge > 20 * 60 * 1000 || updatedAge > 3 * 60 * 1000) {
        await sb.from('autopilot_jobs').update({
          status: 'error',
          message: force ? 'Reemplazado por nueva ejecución.' : 'Job anterior estancado — cancelado.',
          updated_at: new Date().toISOString(),
        }).eq('id', existing[0].id);
      } else {
        return NextResponse.json(
          { error: 'Ya hay un autopilot en ejecución', jobId: existing[0].id },
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

    // Process the first batch inline (~50s) so the user sees immediate progress.
    // The Vercel Cron (every minute) will continue from where this leaves off.
    try {
      await processUntilBudget(jobId, 50_000);
    } catch (e) {
      console.error('[autopilot] first batch error:', e);
      await sb.from('autopilot_jobs').update({
        status: 'error',
        message: `Error: ${e instanceof Error ? e.message : 'Error'}`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    return NextResponse.json({ started: true, jobId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}
