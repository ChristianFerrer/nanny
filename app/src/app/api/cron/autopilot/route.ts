import { NextRequest, NextResponse } from 'next/server';
import { processUntilBudget, findRunningJob } from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Vercel Cron endpoint: invoked every minute.
// Finds the currently running autopilot job (if any) and processes as many
// units of work as fit within 50 seconds (leaving 10s margin before Vercel kills the function).
//
// Auth: Vercel automatically includes `Authorization: Bearer <CRON_SECRET>` header
// when invoking cron endpoints. If CRON_SECRET is set, we verify it.
export async function GET(req: NextRequest) {
  // Verify CRON_SECRET if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const job = await findRunningJob();
  if (!job) {
    return NextResponse.json({ idle: true });
  }

  console.log(`[cron/autopilot] Processing job ${job.id}...`);
  const startedAt = Date.now();

  // Process units until we've used ~45s of budget.
  // Reduced from 50s to leave margin when diagnosis (OpenAI call, ~30-40s)
  // and reeval conv happen in the same invocation. maxDuration=60s on Vercel.
  const result = await processUntilBudget(job.id, 45_000);

  const elapsed = Date.now() - startedAt;
  console.log(
    `[cron/autopilot] Job ${job.id}: processed ${result.processed} units in ${elapsed}ms, status=${result.finalStatus}`,
  );

  return NextResponse.json({
    jobId: job.id,
    processed: result.processed,
    finalStatus: result.finalStatus,
    elapsedMs: elapsed,
  });
}

// Also allow POST for manual testing/triggering
export async function POST(req: NextRequest) {
  return GET(req);
}
