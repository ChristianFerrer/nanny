import { NextResponse } from 'next/server';
import { processUntilBudget, findRunningJob } from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CODE_VERSION = 'v6-extcron';

// Cron endpoint: invoked every minute by external cron service (cron-job.org).
// Finds the currently running autopilot job (if any) and processes as many
// units of work as fit within 45 seconds (leaving margin before maxDuration=60s).
export async function GET() {
  const job = await findRunningJob();
  if (!job) {
    return NextResponse.json({ idle: true, _v: CODE_VERSION });
  }

  console.log(`[cron/autopilot] Processing job ${job.id}...`);
  const startedAt = Date.now();

  const result = await processUntilBudget(job.id, 45_000);

  const elapsed = Date.now() - startedAt;
  console.log(
    `[cron/autopilot] Job ${job.id}: processed ${result.processed} units in ${elapsed}ms, status=${result.finalStatus}`,
  );

  return NextResponse.json({
    _v: CODE_VERSION,
    jobId: job.id,
    processed: result.processed,
    finalStatus: result.finalStatus,
    elapsedMs: elapsed,
  });
}
