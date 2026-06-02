import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult, ConversationResult } from '@/lib/eval/types';

// Lock duration for compare-and-swap locking (must be > Vercel maxDuration).
const LOCK_DURATION_MS = 70 * 1000;

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

// ─── Try to claim exclusive lock on the job ───
// Returns true if this worker now owns the job and can process it.
// Uses compare-and-swap on `locked_until` to prevent POST+Cron race.
// Falls back to processing without lock if the column doesn't exist
// (migration 20260409_autopilot_jobs_lock.sql not applied).
async function claimJob(jobId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const lockUntilIso = new Date(Date.now() + LOCK_DURATION_MS).toISOString();

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

  if (!err1 && data1 && data1.length > 0) return true;

  if (err1 && /locked_until|last_heartbeat|column/i.test(err1.message)) {
    log(jobId, `lock columns missing, proceeding without lock: ${err1.message}`);
    return true;
  }

  // Attempt 2: expired lock
  const { data: data2, error: err2 } = await sb
    .from('autopilot_jobs')
    .update(updatePayload)
    .eq('id', jobId)
    .eq('status', 'running')
    .lt('locked_until', nowIso)
    .select('id');

  if (!err2 && data2 && data2.length > 0) return true;

  if (err2 && /locked_until|last_heartbeat|column/i.test(err2.message)) {
    log(jobId, `lock columns missing, proceeding without lock: ${err2.message}`);
    return true;
  }

  if (err1) log(jobId, `claim attempt 1 error: ${err1.message}`);
  if (err2) log(jobId, `claim attempt 2 error: ${err2.message}`);
  return false;
}

// ─── Release lock (allow other workers to pick up next iteration) ───
async function releaseLock(jobId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('autopilot_jobs').update({
    locked_until: null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (error) log(jobId, `releaseLock warning: ${error.message}`);
}

// ─── DB helpers with error checking ───
async function updateJob(
  jobId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('autopilot_jobs')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) log(jobId, `DB update failed: ${error.message}`);
  return error?.message ?? null;
}

async function failJob(jobId: string, msg: string): Promise<'done'> {
  log(jobId, `FAIL: ${msg}`);
  await updateJob(jobId, { status: 'error', message: msg });
  return 'done';
}

// ─── Process ONE unit of work for a job ───
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

  // ── Evaluation phase (2 conversations in parallel) ──
  if (phase === 'evaluation') {
    if (convIndex < totalConvs) {
      const indices = [convIndex];
      if (convIndex + 1 < totalConvs) indices.push(convIndex + 1);

      log(jobId, `eval conversations ${indices.map(i => i + 1).join(',')}/${totalConvs}`);

      const results = await Promise.all(
        indices.map(async (idx) => {
          try {
            return await processConversation(idx);
          } catch (e) {
            log(jobId, `eval conv ${idx} error: ${e instanceof Error ? e.message : 'err'}`);
            return null;
          }
        }),
      );

      const newScores = [...scores];
      for (const result of results) {
        if (result) {
          newScores.push({
            name: result.conversationName,
            score: result.scores.overall,
            result,
          });
        }
      }

      const nextConv = convIndex + indices.length;
      const isLast = nextConv >= totalConvs;

      const err = await updateJob(jobId, {
        current_conversation: nextConv,
        conversation_scores: newScores,
        message: isLast
          ? 'Evaluación completada. Guardando resultados...'
          : `Evaluando conversación ${nextConv + 1}/${totalConvs}...`,
        phase: isLast ? 'saving' : 'evaluation',
      });
      if (err) return failJob(jobId, `Error guardando progreso eval: ${err}`);
      return 'continue';
    }
    // Defensive: convIndex >= totalConvs but phase still 'evaluation'
    log(jobId, `eval phase with convIndex=${convIndex} >= total=${totalConvs}, forcing transition to saving`);
    const err = await updateJob(jobId, {
      phase: 'saving',
      message: 'Evaluación completada. Guardando resultados...',
    });
    if (err) return failJob(jobId, `Error transición eval→saving: ${err}`);
    return 'continue';
  }

  // ── Saving phase ──
  if (phase === 'saving') {
    log(jobId, 'saving results');

    if (job.eval_run_id) {
      log(jobId, 'eval_run already saved, skipping to diagnosis');
      const err = await updateJob(jobId, {
        phase: 'diagnosis',
        message: 'Ejecutando diagnóstico AI...',
      });
      if (err) return failJob(jobId, `Error transición saving→diagnosis: ${err}`);
      return 'continue';
    }

    const results = scores.map(s => s.result).filter(Boolean);
    if (results.length === 0) {
      return failJob(jobId, 'No se obtuvieron resultados de evaluación');
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

    const { error: insertErr } = await sb.from('evaluation_runs').insert({
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

    if (insertErr) {
      return failJob(jobId, `Error guardando evaluation_run: ${insertErr.message}`);
    }

    if (aggregate.overall >= 1.0) {
      await updateJob(jobId, {
        status: 'completed',
        phase: 'complete',
        eval_run_id: runId,
        aggregate_scores: aggregate,
        message: 'Score perfecto. No se requieren cambios.',
      });
      return 'done';
    }

    const err = await updateJob(jobId, {
      phase: 'diagnosis',
      eval_run_id: runId,
      aggregate_scores: aggregate,
      message: 'Ejecutando diagnóstico AI...',
    });
    if (err) return failJob(jobId, `Error transición saving→diagnosis: ${err}`);
    return 'yield';
  }

  // ── Diagnosis phase ──
  if (phase === 'diagnosis') {
    log(jobId, 'running AI diagnosis');
    const results = scores.map(s => s.result).filter(Boolean);

    let diagnosis;
    try {
      const { diagnoseResults } = await import('@/lib/eval/diagnosis');
      const { CLASSIFIER_PROMPT_TEXT, EXTRACTOR_PROMPT_TEXT } = await import('@/app/api/eval/prompt/prompt-texts');
      const { getAllRules } = await import('@/lib/chat/prompt-rules');
      const currentRules = await getAllRules();
      diagnosis = await diagnoseResults(results, {
        classifier: CLASSIFIER_PROMPT_TEXT,
        extractor: EXTRACTOR_PROMPT_TEXT,
      }, {
        activeRules: currentRules.map(r => ({ target: r.target, rule: r.rule })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      await updateJob(jobId, {
        status: 'completed',
        phase: 'complete',
        message: `Diagnóstico falló: ${msg}`,
        diagnosis_summary: `Error: ${msg}`,
      });
      return 'done';
    }

    const adjustments = diagnosis.proposedAdjustments || [];

    // Track iteration count in diagnosis_summary
    const prevSummary = (job.diagnosis_summary as string) || '';
    const iterCount = (prevSummary.match(/\[Ciclo \d+\]/g) || []).length + 1;
    const iterSummary = prevSummary
      ? `${prevSummary}\n[Ciclo ${iterCount}] ${diagnosis.summary}`
      : `[Ciclo ${iterCount}] ${diagnosis.summary}`;

    if (adjustments.length === 0) {
      await updateJob(jobId, {
        status: 'completed',
        phase: 'complete',
        message: `Diagnóstico completado (ciclo ${iterCount}). Sin ajustes propuestos.`,
        diagnosis_summary: iterSummary,
      });
      return 'done';
    }

    const { addRule, saveSnapshot, clearAllRules } = await import('@/lib/chat/prompt-rules');
    try {
      await saveSnapshot();
    } catch (e) {
      log(jobId, `saveSnapshot warning: ${e instanceof Error ? e.message : 'err'}`);
    }

    // Clear old rules before applying new ones — prevents accumulation across runs
    try {
      await clearAllRules();
      log(jobId, 'cleared old rules before applying new diagnosis');
    } catch (e) {
      log(jobId, `clearRules warning: ${e instanceof Error ? e.message : 'err'}`);
    }

    let appliedCount = 0;
    for (const adj of adjustments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const action = (adj as any).action || 'add';
      if (action === 'remove') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ruleId = (adj as any).ruleId;
        if (ruleId) {
          const { removeRule } = await import('@/lib/chat/prompt-rules');
          try {
            await removeRule(ruleId);
            appliedCount++;
            log(jobId, `removed rule ${ruleId}`);
          } catch (e) {
            log(jobId, `removeRule failed: ${e instanceof Error ? e.message : 'err'}`);
          }
        }
        continue;
      }
      if (!adj.proposedChange) continue;
      try {
        await addRule(adj.target || 'extractor', adj.proposedChange, `Autopilot: ${adj.pattern}`);
        appliedCount++;
      } catch (e) {
        log(jobId, `addRule failed: ${e instanceof Error ? e.message : 'err'}`);
      }
    }

    log(jobId, `diagnosis done, ${appliedCount} rules applied`);

    const err = await updateJob(jobId, {
      phase: appliedCount > 0 ? 'reeval' : 'complete',
      status: appliedCount > 0 ? 'running' : 'completed',
      message: appliedCount > 0
        ? `${appliedCount} ajustes aplicados. Re-evaluando...`
        : 'Sin ajustes aplicables.',
      diagnosis_summary: iterSummary,
      adjustments_applied: appliedCount,
      current_conversation: 0,
      conversation_scores: [],
    });
    if (err) return failJob(jobId, `Error transición diagnosis→reeval: ${err}`);
    return appliedCount > 0 ? 'yield' : 'done';
  }

  // ── Reeval phase (2 conversations in parallel) ──
  if (phase === 'reeval') {
    if (convIndex < totalConvs) {
      const indices = [convIndex];
      if (convIndex + 1 < totalConvs) indices.push(convIndex + 1);

      log(jobId, `reeval conversations ${indices.map(i => i + 1).join(',')}/${totalConvs}`);

      const results = await Promise.all(
        indices.map(async (idx) => {
          try {
            return await processConversation(idx);
          } catch (e) {
            log(jobId, `reeval conv ${idx} error: ${e instanceof Error ? e.message : 'err'}`);
            return null;
          }
        }),
      );

      const newScores = [...scores];
      for (const result of results) {
        if (result) {
          newScores.push({ name: result.conversationName, score: result.scores.overall, result });
        }
      }

      const nextConv = convIndex + indices.length;
      const isLast = nextConv >= totalConvs;

      const progressErr = await updateJob(jobId, {
        current_conversation: nextConv,
        conversation_scores: newScores,
        message: isLast
          ? 'Re-evaluación completada. Comparando scores...'
          : `Re-evaluando ${nextConv + 1}/${totalConvs}...`,
      });
      if (progressErr) return failJob(jobId, `Error guardando progreso reeval: ${progressErr}`);

      if (isLast) {
        const reResults = newScores.map(s => s.result).filter(Boolean);
        const avg = (nums: number[]) =>
          nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

        const postScore = avg(reResults.map(r => r.scores.overall));
        const preScore = (job.aggregate_scores as { overall: number })?.overall ?? 0;

        // Count iterations from diagnosis_summary
        const prevSummary = (job.diagnosis_summary as string) || '';
        const iterCount = (prevSummary.match(/\[Ciclo \d+\]/g) || []).length;
        const MAX_ITERATIONS = 3;

        if (postScore < preScore) {
          log(jobId, `reeval worse: ${preScore} → ${postScore}, rolling back`);
          try {
            const { rollbackToSnapshot } = await import('@/lib/chat/prompt-rules');
            await rollbackToSnapshot();
          } catch (e) {
            log(jobId, `rollback warning: ${e instanceof Error ? e.message : 'err'}`);
          }

          await updateJob(jobId, {
            status: 'completed',
            phase: 'complete',
            message: `Score bajó (${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%). Rollback aplicado.`,
            reeval_pre_score: preScore,
            reeval_post_score: postScore,
            reeval_improved: false,
            reeval_rolled_back: true,
            adjustments_applied: 0,
          });
        } else if (postScore > preScore && iterCount < MAX_ITERATIONS) {
          // Score improved and we have iterations left — loop back for another diagnosis cycle
          log(jobId, `reeval improved: ${preScore} → ${postScore}, starting cycle ${iterCount + 2}/${MAX_ITERATIONS + 1}`);
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
          await updateJob(jobId, {
            phase: 'diagnosis',
            aggregate_scores: reAggregate,
            current_conversation: 0,
            conversation_scores: newScores,
            message: `Ciclo ${iterCount + 2}: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%. Diagnosticando de nuevo...`,
            reeval_pre_score: preScore,
            reeval_post_score: postScore,
            reeval_improved: true,
          });
          return 'yield';
        } else {
          log(jobId, `reeval final: ${preScore} → ${postScore} (${iterCount + 1} cycles)`);
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
          const { error: reInsertErr } = await sb.from('evaluation_runs').insert({
            id: reRunId,
            timestamp: new Date().toISOString(),
            prompt_version: `autopilot-post-cycle${iterCount + 1}`,
            model: 'gpt-4o-mini',
            conversation_results: reResults,
            aggregate_scores: reAggregate,
            total_conversations: reResults.length,
            perfect_conversations: reResults.filter(r => r.scores.overall >= 0.9).length,
            partial_conversations: reResults.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
            failed_conversations: reResults.filter(r => r.scores.overall < 0.6).length,
            total_time_ms: reResults.reduce((sum, r) => sum + r.totalTimeMs, 0),
          });

          if (reInsertErr) {
            log(jobId, `reeval insert warning: ${reInsertErr.message}`);
          }

          await updateJob(jobId, {
            status: 'completed',
            phase: 'complete',
            eval_run_id: reInsertErr ? undefined : reRunId,
            aggregate_scores: reAggregate,
            message: `Score mejoró: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}% (${iterCount + 1} ciclos)`,
            reeval_pre_score: preScore,
            reeval_post_score: postScore,
            reeval_improved: postScore >= preScore,
            reeval_rolled_back: false,
          });
        }
        return 'done';
      }

      return 'continue';
    }
    // Defensive: convIndex >= totalConvs but phase still 'reeval'
    log(jobId, `reeval phase with convIndex=${convIndex} >= total=${totalConvs}, forcing completion`);
    const preScore = (job.aggregate_scores as { overall: number })?.overall ?? 0;
    const postScore = scores.length > 0
      ? Math.round((scores.reduce((a, s) => a + s.score, 0) / scores.length) * 100) / 100
      : 0;
    await updateJob(jobId, {
      status: 'completed',
      phase: 'complete',
      message: `Re-evaluación completada: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%`,
      reeval_pre_score: preScore,
      reeval_post_score: postScore,
      reeval_improved: postScore >= preScore,
      reeval_rolled_back: false,
    });
    return 'done';
  }

  return 'done';
}

// ─── Process as many units as fit within the time budget ───
// Claims the lock ONCE at the start and holds it for the whole budget window.
const MIN_UNIT_MS = 10_000;
export async function processUntilBudget(
  jobId: string,
  maxMs: number,
): Promise<{ processed: number; finalStatus: 'continue' | 'done' | 'stop' }> {
  const startedAt = Date.now();
  let processed = 0;
  let lastStatus: UnitResult = 'continue';

  const claimed = await claimJob(jobId);
  if (!claimed) {
    log(jobId, 'could not claim lock — another worker owns it');
    return { processed: 0, finalStatus: 'stop' };
  }

  try {
    while (true) {
      const remaining = maxMs - (Date.now() - startedAt);
      if (remaining < MIN_UNIT_MS) {
        log(jobId, `budget low (${Math.round(remaining / 1000)}s), stopping`);
        break;
      }

      try {
        lastStatus = await processOneUnit(jobId);
      } catch (e) {
        console.error(`[autopilot-worker] Job ${jobId} error:`, e);
        await failJob(jobId, `Error inesperado: ${e instanceof Error ? e.message : 'Error desconocido'}`);
        return { processed, finalStatus: 'stop' };
      }

      processed++;

      if (lastStatus === 'yield') {
        await releaseLock(jobId);
        log(jobId, `yielding after phase transition, processed ${processed} units`);
        return { processed, finalStatus: 'continue' };
      }

      if (lastStatus !== 'continue') {
        await releaseLock(jobId);
        return { processed, finalStatus: lastStatus };
      }
    }

    await releaseLock(jobId);
    log(jobId, `budget exhausted, processed ${processed} units`);
  } catch (e) {
    await releaseLock(jobId).catch(() => {});
    throw e;
  }

  return { processed, finalStatus: lastStatus };
}

// ─── Find the currently running job (if any) ───
// Used by the cron endpoint. Does NOT expire the job — the cron's purpose is
// to PROCESS work, not to garbage-collect. Expiry of old jobs (>20 min) happens
// in the POST handler via direct SQL before creating a new job.
export async function findRunningJob(): Promise<{ id: string } | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('autopilot_jobs')
    .select('id')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return { id: data[0].id };
}

// ─── Public helper: detailed status of the latest job ───
// READ-ONLY: never modifies DB. Used by GET /api/eval/autopilot for UI polling.
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
