import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult, ConversationResult } from '@/lib/eval/types';

// ─── Configuración central ───
// Un job se considera "stuck" si no actualizó su heartbeat en STUCK_AFTER_MS.
// Un job se considera "expired" si se creó hace más de MAX_JOB_AGE_MS.
// El lock de un worker dura LOCK_DURATION_MS (debe ser mayor que maxDuration
// de Vercel para evitar que otro worker entre mientras el primero sigue vivo).
const STUCK_AFTER_MS = 5 * 60 * 1000; // 5 minutos sin heartbeat → stuck
const MAX_JOB_AGE_MS = 30 * 60 * 1000; // 30 minutos máximos de vida total
const LOCK_DURATION_MS = 70 * 1000; // 70s de lock por worker (maxDuration=60s)

function log(jobId: string, msg: string, meta?: Record<string, unknown>) {
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  console.log(`[autopilot ${jobId.slice(0, 8)}] ${msg}${metaStr}`);
}

// ─── Process a single conversation ───
async function processConversation(convIndex: number): Promise<ConversationResult | null> {
  const conversation = allConversations[convIndex];
  if (!conversation) return null;

  const profile = profiles.find(p => p.id === conversation.profileId);
  if (!profile) return null;

  const state = {
    recentMessages: [] as string[],
    createdEvents: [] as string[],
    createdTasks: [] as string[],
    activeMedications: [] as string[],
    pendingDetection: null as unknown,
    messageResults: [] as MessageResult[],
  };

  for (let msgIdx = 0; msgIdx < conversation.messages.length; msgIdx++) {
    const msg = conversation.messages[msgIdx];
    const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;
    const familyContext = buildFamilyContext(profile);
    const recentStr = state.recentMessages.slice(-15).join('\n') || 'Ninguno';
    const msgStart = Date.now();
    let response = null;
    let error: string | undefined;

    try {
      response = await processChat({
        message: msg.text,
        familyContext,
        recentMessages: recentStr,
        existingEvents: state.createdEvents.join('\n') || 'Ninguno',
        existingTasks: state.createdTasks.join('\n') || 'Ninguna',
        activeMedications: state.activeMedications.join('\n') || 'Ninguno',
        senderName,
        senderRole: msg.sender === 'papa' ? 'papa' : 'mama',
        pendingDetection: state.pendingDetection as Record<string, unknown> | null,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    state.recentMessages.push(`${senderName}: ${msg.text}`);
    if (response) {
      if (response.should_respond && response.reply) {
        state.recentMessages.push(`Nanny: ${response.reply}`);
      }
      if (response.confirmation) {
        const conf = response.confirmation;
        if (conf.type === 'event') {
          state.createdEvents.push(`${conf.data.title} - ${conf.data.date_start || ''} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'task') {
          state.createdTasks.push(`${conf.data.title} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'medication') {
          state.activeMedications.push(`${conf.data.medication_name} - ${conf.data.frequency || ''}`);
        }
      }
      state.pendingDetection = response.pending_detection || null;
    }

    state.messageResults.push({
      messageIndex: msgIdx,
      senderName,
      messageText: msg.text,
      response,
      responseTimeMs: Date.now() - msgStart,
      error,
    });
  }

  const { detectionMatches, behaviorMatches, scores } = scoreConversation(conversation, state.messageResults);

  return {
    conversationId: conversation.id,
    conversationName: conversation.name,
    profileId: conversation.profileId,
    messageResults: state.messageResults,
    detectionMatches,
    behaviorMatches,
    scores,
    totalTimeMs: state.messageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
  };
}

type ScoreEntry = { name: string; score: number; result: ConversationResult };

// ─── Auto-expire stale job (used by both GET and claim) ───
async function expireIfStale(
  jobId: string,
  createdAt: string,
  lastHeartbeat: string | null,
): Promise<{ expired: boolean; reason?: string }> {
  const createdAge = Date.now() - new Date(createdAt).getTime();
  const heartbeatAge = lastHeartbeat
    ? Date.now() - new Date(lastHeartbeat).getTime()
    : createdAge;

  let reason: string | null = null;
  if (createdAge > MAX_JOB_AGE_MS) {
    reason = `Timeout: el job excedió los ${Math.round(MAX_JOB_AGE_MS / 60000)} minutos máximos`;
  } else if (heartbeatAge > STUCK_AFTER_MS) {
    reason = `Job colgado: sin heartbeat por ${Math.round(heartbeatAge / 1000)}s`;
  }

  if (!reason) return { expired: false };

  const sb = getSupabaseAdmin();
  await sb.from('autopilot_jobs').update({
    status: 'error',
    message: reason,
    locked_until: null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);

  log(jobId, `expired: ${reason}`);
  return { expired: true, reason };
}

// ─── Try to claim exclusive lock on the job ───
// Returns true if this worker now owns the job and can process it.
// Uses compare-and-swap on `locked_until` to prevent POST+Cron race.
async function claimJob(jobId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const lockUntilIso = new Date(Date.now() + LOCK_DURATION_MS).toISOString();

  // Update only if: status=running AND (locked_until IS NULL OR locked_until < now())
  //
  // We can't use `.or()` with an ISO timestamp value because PostgREST parses
  // colons/dots as filter separators and chokes. Instead we do two atomic
  // UPDATEs: first try to claim an unlocked job (locked_until IS NULL), then
  // try to claim an expired one (locked_until < now). Each UPDATE is atomic
  // thanks to Postgres row-level locking; at most one of the two will claim.
  const updatePayload = {
    locked_until: lockUntilIso,
    last_heartbeat: nowIso,
    updated_at: nowIso,
  };

  // Attempt 1: unlocked (NULL)
  const { data: data1, error: err1 } = await sb
    .from('autopilot_jobs')
    .update(updatePayload)
    .eq('id', jobId)
    .eq('status', 'running')
    .is('locked_until', null)
    .select('id');

  if (err1) {
    log(jobId, `claim attempt 1 error: ${err1.message}`);
    return false;
  }

  if (data1 && data1.length > 0) return true;

  // Attempt 2: expired lock
  const { data: data2, error: err2 } = await sb
    .from('autopilot_jobs')
    .update(updatePayload)
    .eq('id', jobId)
    .eq('status', 'running')
    .lt('locked_until', nowIso)
    .select('id');

  if (err2) {
    log(jobId, `claim attempt 2 error: ${err2.message}`);
    return false;
  }

  return !!(data2 && data2.length > 0);
}

// ─── Release lock (allow other workers to pick up next iteration) ───
async function releaseLock(jobId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from('autopilot_jobs').update({
    locked_until: null,
    last_heartbeat: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

// ─── Process ONE unit of work for a job ───
// Assumes caller already holds the lock. Does NOT re-claim.
// Returns:
//   'continue' — more work pending, keep looping.
//   'done'     — job is complete (or terminal error).
//   'stop'     — job not running or can't proceed.
//   'yield'    — phase transition done, release lock and let the NEXT cron
//                invocation continue. Prevents a heavy phase (diagnosis ~40s)
//                from cascading into reeval in the same invocation and exceeding
//                Vercel's maxDuration (60s).
type UnitResult = 'continue' | 'done' | 'stop' | 'yield';
async function processOneUnit(jobId: string): Promise<UnitResult> {
  const sb = getSupabaseAdmin();

  const { data: job, error: jobError } = await sb
    .from('autopilot_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job || job.status !== 'running') {
    return 'stop';
  }

  const phase = job.phase as string;
  const convIndex = job.current_conversation as number;
  const totalConvs = job.total_conversations as number;
  const scores = (job.conversation_scores || []) as ScoreEntry[];

  if (phase === 'evaluation') {
    if (convIndex < totalConvs) {
      log(jobId, `eval conversation ${convIndex + 1}/${totalConvs}`);
      const result = await processConversation(convIndex);

      const newScores = [...scores];
      if (result) {
        newScores.push({
          name: result.conversationName,
          score: result.scores.overall,
          result,
        });
      }

      const nextConv = convIndex + 1;
      const isLast = nextConv >= totalConvs;

      await sb.from('autopilot_jobs').update({
        current_conversation: nextConv,
        conversation_scores: newScores,
        message: isLast
          ? 'Evaluación completada. Guardando resultados...'
          : `Evaluando conversación ${nextConv + 1}/${totalConvs}...`,
        phase: isLast ? 'saving' : 'evaluation',
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      return 'continue';
    }
  }

  if (phase === 'saving') {
    log(jobId, 'saving results');
    // Idempotencia: si eval_run_id ya está seteado, este job ya fue guardado
    // antes (probablemente por un worker anterior que murió sin actualizar
    // el phase). Saltar directo a diagnosis para no duplicar la fila.
    if (job.eval_run_id) {
      log(jobId, 'eval_run already saved, skipping to diagnosis');
      await sb.from('autopilot_jobs').update({
        phase: 'diagnosis',
        message: 'Ejecutando diagnóstico AI...',
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return 'continue';
    }

    const results = scores.map(s => s.result).filter(Boolean);
    if (results.length === 0) {
      await sb.from('autopilot_jobs').update({
        status: 'error',
        message: 'No se obtuvieron resultados',
        locked_until: null,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return 'done';
    }

    const avg = (nums: number[]) =>
      nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

    const aggregate = {
      precision: avg(results.map(r => r.scores.precision)),
      recall: avg(results.map(r => r.scores.recall)),
      ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
      behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
      falsePositiveRate: avg(results.map(r => r.scores.falsePositiveRate ?? 0)),
      fieldAccuracy: {
        dateAccuracy: avg(results.map(r => r.scores.fieldAccuracy?.dateAccuracy ?? 1)),
        ownerAccuracy: avg(results.map(r => r.scores.fieldAccuracy?.ownerAccuracy ?? 1)),
        typeAccuracy: avg(results.map(r => r.scores.fieldAccuracy?.typeAccuracy ?? 1)),
      },
      overall: avg(results.map(r => r.scores.overall)),
    };

    const runId = crypto.randomUUID();
    const totalTimeMs = results.reduce((sum, r) => sum + r.totalTimeMs, 0);

    await sb.from('evaluation_runs').insert({
      id: runId,
      timestamp: new Date().toISOString(),
      prompt_version: 'autopilot-pre',
      model: 'gpt-4o-mini',
      conversation_results: results,
      aggregate_scores: aggregate,
      total_conversations: results.length,
      perfect_conversations: results.filter(r => r.scores.overall >= 0.9).length,
      partial_conversations: results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
      failed_conversations: results.filter(r => r.scores.overall < 0.6).length,
      total_time_ms: totalTimeMs,
    });

    if (aggregate.overall >= 1.0) {
      await sb.from('autopilot_jobs').update({
        status: 'completed',
        phase: 'complete',
        eval_run_id: runId,
        aggregate_scores: aggregate,
        message: 'Score perfecto. No se requieren cambios.',
        locked_until: null,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return 'done';
    }

    await sb.from('autopilot_jobs').update({
      phase: 'diagnosis',
      eval_run_id: runId,
      aggregate_scores: aggregate,
      message: 'Ejecutando diagnóstico AI...',
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Yield: diagnosis is a heavy OpenAI call (~30-40s). Start it in a fresh
    // cron invocation with full budget instead of the tail end of this one.
    return 'yield';
  }

  if (phase === 'diagnosis') {
    log(jobId, 'running AI diagnosis');
    const results = scores.map(s => s.result).filter(Boolean);

    let diagnosis;
    try {
      const { diagnoseResults } = await import('@/lib/eval/diagnosis');
      const { CLASSIFIER_PROMPT_TEXT, EXTRACTOR_PROMPT_TEXT } = await import('@/app/api/eval/prompt/prompt-texts');
      diagnosis = await diagnoseResults(results, {
        classifier: CLASSIFIER_PROMPT_TEXT,
        extractor: EXTRACTOR_PROMPT_TEXT,
      });
    } catch (e) {
      await sb.from('autopilot_jobs').update({
        status: 'completed',
        phase: 'complete',
        message: `Diagnóstico falló: ${e instanceof Error ? e.message : 'Error'}`,
        diagnosis_summary: `Error: ${e instanceof Error ? e.message : 'Error'}`,
        locked_until: null,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return 'done';
    }

    const adjustments = diagnosis.proposedAdjustments || [];

    if (adjustments.length === 0) {
      await sb.from('autopilot_jobs').update({
        status: 'completed',
        phase: 'complete',
        message: 'Diagnóstico completado. Sin ajustes propuestos.',
        diagnosis_summary: diagnosis.summary,
        locked_until: null,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      return 'done';
    }

    const { addRule, saveSnapshot } = await import('@/lib/chat/prompt-rules');
    await saveSnapshot();

    let appliedCount = 0;
    for (const adj of adjustments) {
      if (!adj.proposedChange) continue;
      try {
        await addRule(adj.target || 'extractor', adj.proposedChange, `Autopilot: ${adj.pattern}`);
        appliedCount++;
      } catch (e) {
        log(jobId, `addRule failed: ${e instanceof Error ? e.message : 'err'}`);
      }
    }

    log(jobId, `diagnosis done, ${appliedCount} rules applied`);

    await sb.from('autopilot_jobs').update({
      phase: appliedCount > 0 ? 'reeval' : 'complete',
      status: appliedCount > 0 ? 'running' : 'completed',
      message: appliedCount > 0
        ? `${appliedCount} ajustes aplicados. Re-evaluando...`
        : 'Sin ajustes aplicables.',
      diagnosis_summary: diagnosis.summary,
      adjustments_applied: appliedCount,
      current_conversation: 0,
      conversation_scores: [],
      locked_until: null,
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    // Yield so reeval starts in a fresh cron invocation with full budget.
    // Diagnosis itself can take 30-40s (OpenAI call). If we returned 'continue'
    // here, processUntilBudget would immediately start reeval conv 0 (~25s),
    // pushing total to ~65s — exceeding Vercel maxDuration (60s).
    return appliedCount > 0 ? 'yield' : 'done';
  }

  if (phase === 'reeval') {
    if (convIndex < totalConvs) {
      log(jobId, `reeval conversation ${convIndex + 1}/${totalConvs}`);
      const result = await processConversation(convIndex);
      const newScores = [...scores];
      if (result) {
        newScores.push({ name: result.conversationName, score: result.scores.overall, result });
      }

      const nextConv = convIndex + 1;
      const isLast = nextConv >= totalConvs;

      await sb.from('autopilot_jobs').update({
        current_conversation: nextConv,
        conversation_scores: newScores,
        message: isLast
          ? 'Re-evaluación completada. Comparando scores...'
          : `Re-evaluando ${nextConv + 1}/${totalConvs}...`,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      if (isLast) {
        const reResults = newScores.map(s => s.result).filter(Boolean);
        const avg = (nums: number[]) =>
          nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

        const postScore = avg(reResults.map(r => r.scores.overall));
        const preScore = (job.aggregate_scores as { overall: number })?.overall ?? 0;

        if (postScore < preScore) {
          log(jobId, `reeval worse: ${preScore} → ${postScore}, rolling back`);
          const { rollbackToSnapshot } = await import('@/lib/chat/prompt-rules');
          await rollbackToSnapshot();

          await sb.from('autopilot_jobs').update({
            status: 'completed',
            phase: 'complete',
            message: `Score bajó (${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%). Rollback aplicado.`,
            reeval_pre_score: preScore,
            reeval_post_score: postScore,
            reeval_improved: false,
            reeval_rolled_back: true,
            adjustments_applied: 0,
            locked_until: null,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', jobId);
        } else {
          log(jobId, `reeval improved: ${preScore} → ${postScore}`);
          const reAggregate = {
            precision: avg(reResults.map(r => r.scores.precision)),
            recall: avg(reResults.map(r => r.scores.recall)),
            ambiguityHandling: avg(reResults.map(r => r.scores.ambiguityHandling)),
            behaviorScore: avg(reResults.map(r => r.scores.behaviorScore)),
            falsePositiveRate: avg(reResults.map(r => r.scores.falsePositiveRate ?? 0)),
            fieldAccuracy: {
              dateAccuracy: avg(reResults.map(r => r.scores.fieldAccuracy?.dateAccuracy ?? 1)),
              ownerAccuracy: avg(reResults.map(r => r.scores.fieldAccuracy?.ownerAccuracy ?? 1)),
              typeAccuracy: avg(reResults.map(r => r.scores.fieldAccuracy?.typeAccuracy ?? 1)),
            },
            overall: postScore,
          };

          const reRunId = crypto.randomUUID();
          await sb.from('evaluation_runs').insert({
            id: reRunId,
            timestamp: new Date().toISOString(),
            prompt_version: 'autopilot-post',
            model: 'gpt-4o-mini',
            conversation_results: reResults,
            aggregate_scores: reAggregate,
            total_conversations: reResults.length,
            perfect_conversations: reResults.filter(r => r.scores.overall >= 0.9).length,
            partial_conversations: reResults.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
            failed_conversations: reResults.filter(r => r.scores.overall < 0.6).length,
            total_time_ms: reResults.reduce((sum, r) => sum + r.totalTimeMs, 0),
          });

          await sb.from('autopilot_jobs').update({
            status: 'completed',
            phase: 'complete',
            eval_run_id: reRunId,
            aggregate_scores: reAggregate,
            message: `Score mejoró: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%`,
            reeval_pre_score: preScore,
            reeval_post_score: postScore,
            reeval_improved: true,
            reeval_rolled_back: false,
            locked_until: null,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', jobId);
        }
        return 'done';
      }

      return 'continue';
    }
  }

  return 'done';
}

// ─── Process as many units as fit within the time budget ───
// Claims the lock ONCE at the start and holds it for the whole budget window.
// Returns number of units processed and final status.
export async function processUntilBudget(
  jobId: string,
  maxMs: number,
): Promise<{ processed: number; finalStatus: 'continue' | 'done' | 'stop' }> {
  const startedAt = Date.now();
  let processed = 0;
  let lastStatus: UnitResult = 'continue';

  // Try to claim the lock before doing any work.
  const claimed = await claimJob(jobId);
  if (!claimed) {
    log(jobId, 'could not claim lock — another worker owns it');
    return { processed: 0, finalStatus: 'stop' };
  }

  try {
    while (Date.now() - startedAt < maxMs) {
      try {
        lastStatus = await processOneUnit(jobId);
      } catch (e) {
        console.error(`[autopilot-worker] Job ${jobId} error:`, e);
        const sb = getSupabaseAdmin();
        await sb.from('autopilot_jobs').update({
          status: 'error',
          message: `Error: ${e instanceof Error ? e.message : 'Error desconocido'}`,
          locked_until: null,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return { processed, finalStatus: 'stop' };
      }

      processed++;

      if (lastStatus === 'yield') {
        // Phase transition — release lock and let the next cron pick it up.
        // This prevents heavy phases from cascading in the same invocation.
        await releaseLock(jobId);
        log(jobId, `yielding after phase transition, processed ${processed} units`);
        return { processed, finalStatus: 'continue' };
      }

      if (lastStatus !== 'continue') {
        // Clear lock on terminal states (done/stop)
        if (lastStatus === 'stop') {
          await releaseLock(jobId);
        }
        // 'done' already updated the row with locked_until=null
        return { processed, finalStatus: lastStatus };
      }
    }

    // Budget exhausted — release lock so next cron tick can continue.
    await releaseLock(jobId);
    log(jobId, `budget exhausted, processed ${processed} units`);
  } catch (e) {
    await releaseLock(jobId).catch(() => {});
    throw e;
  }

  return { processed, finalStatus: lastStatus };
}

// ─── Find the currently running job (if any), auto-expiring stale ones ───
// Used by GET endpoint (status) AND by cron (claim decision).
export async function findRunningJob(): Promise<{ id: string } | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('autopilot_jobs')
    .select('id, created_at, last_heartbeat, locked_until')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;

  const row = data[0];
  const { expired } = await expireIfStale(row.id, row.created_at, row.last_heartbeat);
  if (expired) return null;

  return { id: row.id };
}

// ─── Public helper: detailed status of the latest job ───
// READ-ONLY: does NOT expire jobs. Only the cron (via findRunningJob) expires
// stale jobs. This prevents the client polling (every 5s via GET /api/eval/autopilot)
// from killing a job that the cron is about to pick up.
export async function getLatestJobStatus(): Promise<{
  active: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any | null;
}> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('autopilot_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return { active: false, job: null };

  return { active: data.status === 'running', job: data };
}
