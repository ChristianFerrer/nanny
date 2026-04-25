import { NextRequest, NextResponse, after } from 'next/server';
import { processUntilBudget, findRunningJob } from '@/lib/eval/autopilot-worker';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CODE_VERSION = 'v8-parallel';

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

  // Use after() so the self-invoke fires reliably after response is sent.
  // fire-and-forget fetch() was being killed by Vercel before completing.
  if (result.finalStatus === 'continue' && depth < 30) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || '';
    const nextUrl = `${proto}://${host}/api/cron/autopilot?d=${depth + 1}`;
    after(async () => {
      try {
        await fetch(nextUrl);
      } catch (e) {
        console.error('[cron/autopilot] self-invoke failed:', e);
      }
    });
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
