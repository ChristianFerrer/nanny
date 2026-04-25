import { NextRequest, NextResponse } from 'next/server';
import { processUntilBudget, findRunningJob } from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CODE_VERSION = 'v7-chain';

// Cron endpoint: invoked every minute by external cron service (cron-job.org).
// After processing a batch, if work remains, self-invokes to continue
// immediately — no waiting for the next cron tick. The cron acts as a
// safety net that restarts the chain if it breaks.
export async function GET(req: NextRequest) {
  const depth = parseInt(req.nextUrl.searchParams.get('d') || '0');

  const job = await findRunningJob();
  if (!job) {
    return NextResponse.json({ idle: true, _v: CODE_VERSION });
  }

  console.log(`[cron/autopilot] Processing job ${job.id} (depth=${depth})...`);
  const startedAt = Date.now();

  const result = await processUntilBudget(job.id, 45_000);

  const elapsed = Date.now() - startedAt;
  console.log(
    `[cron/autopilot] Job ${job.id}: ${result.processed} units in ${elapsed}ms, status=${result.finalStatus}`,
  );

  // Self-invoke to continue immediately if there's more work.
  // Max depth=30 prevents runaway chains (~30 min of processing).
  // The external cron restarts the chain every minute if it breaks.
  if (result.finalStatus === 'continue' && depth < 30) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || '';
    const nextUrl = `${proto}://${host}/api/cron/autopilot?d=${depth + 1}`;
    fetch(nextUrl).catch(() => {});
  }

  return NextResponse.json({
    _v: CODE_VERSION,
    jobId: job.id,
    processed: result.processed,
    finalStatus: result.finalStatus,
    elapsedMs: elapsed,
    depth,
  });
}
