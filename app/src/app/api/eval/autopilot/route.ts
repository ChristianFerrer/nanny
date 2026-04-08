import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult, ConversationResult } from '@/lib/eval/types';

export const maxDuration = 60;

// ─── Ensure table exists ───
let tableVerified = false;
async function ensureTable() {
  if (tableVerified) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('autopilot_jobs').select('id').limit(1);

  if (error?.code === '42P01') {
    // Table doesn't exist — create via Supabase SQL endpoint
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const sql = `
        CREATE TABLE IF NOT EXISTS autopilot_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          status TEXT NOT NULL DEFAULT 'running',
          phase TEXT NOT NULL DEFAULT 'evaluation',
          current_conversation INTEGER NOT NULL DEFAULT 0,
          total_conversations INTEGER NOT NULL DEFAULT 0,
          message TEXT DEFAULT '',
          conversation_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
          eval_run_id UUID,
          aggregate_scores JSONB,
          diagnosis_summary TEXT,
          adjustments_applied INTEGER DEFAULT 0,
          reeval_pre_score NUMERIC,
          reeval_post_score NUMERIC,
          reeval_improved BOOLEAN,
          reeval_rolled_back BOOLEAN,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE autopilot_jobs ENABLE ROW LEVEL SECURITY;
      `;

      try {
        // Use Supabase's pg-meta SQL endpoint
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ query: sql }),
        });

        if (!res.ok) {
          // Fallback: try via the sql endpoint (pg-meta)
          console.log('[autopilot] rpc failed, trying pg-meta...');
          const pgRes = await fetch(`${supabaseUrl.replace('.supabase.co', '.supabase.co')}/pg/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ query: sql }),
          });
          if (!pgRes.ok) {
            console.error('[autopilot] Could not create table. Please run the migration SQL manually.');
          }
        }
      } catch (e) {
        console.error('[autopilot] Table creation failed:', e);
      }
    }

    // Verify it was created
    const { error: retryError } = await sb.from('autopilot_jobs').select('id').limit(1);
    if (retryError?.code === '42P01') {
      throw new Error('Table autopilot_jobs no existe. Ejecuta el SQL de supabase/migrations/20260408_autopilot_jobs.sql en el dashboard de Supabase.');
    }
  }

  tableVerified = true;
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

    // If running and older than 7 minutes, mark as error (stale)
    if (data.status === 'running') {
      const age = Date.now() - new Date(data.created_at).getTime();
      if (age > 7 * 60 * 1000) {
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

// ─── POST: Start new job OR continue processing next chunk ───
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json().catch(() => ({}));
    const sb = getSupabaseAdmin();

    // If jobId provided, continue that job's next chunk
    if (body.jobId) {
      return await processNextChunk(body.jobId, req);
    }

    // Otherwise, start a new job
    // First check there's no active job
    const { data: existing } = await sb
      .from('autopilot_jobs')
      .select('id')
      .eq('status', 'running')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'Ya hay un autopilot en ejecución', jobId: existing[0].id },
        { status: 409 },
      );
    }

    // Create new job
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

    // Trigger first chunk processing
    triggerNextChunk(req, jobId);

    return NextResponse.json({ started: true, jobId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}

// ─── Trigger the next chunk via self-invocation ───
function triggerNextChunk(req: NextRequest, jobId: string) {
  const baseUrl = req.nextUrl.origin;
  // Fire-and-forget: don't await
  fetch(`${baseUrl}/api/eval/autopilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(err => {
    console.error('[autopilot] Failed to trigger next chunk:', err);
  });
}

// ─── Process the next chunk for a job ───
async function processNextChunk(jobId: string, req: NextRequest): Promise<NextResponse> {
  const sb = getSupabaseAdmin();

  // Load job state
  const { data: job, error: jobError } = await sb
    .from('autopilot_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job || job.status !== 'running') {
    return NextResponse.json({ error: 'Job not found or not running' }, { status: 404 });
  }

  const phase = job.phase as string;
  const convIndex = job.current_conversation as number;
  const totalConvs = job.total_conversations as number;
  const scores = (job.conversation_scores || []) as Array<{
    name: string;
    score: number;
    result: ConversationResult;
  }>;

  try {
    if (phase === 'evaluation') {
      // Process one conversation
      if (convIndex < totalConvs) {
        const convName = allConversations[convIndex]?.name || `Conv ${convIndex + 1}`;
        console.log(`[autopilot] Job ${jobId}: evaluating ${convIndex + 1}/${totalConvs} — ${convName}`);

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
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        // Trigger next chunk
        triggerNextChunk(req, jobId);
        return NextResponse.json({ ok: true, next: isLast ? 'saving' : 'evaluation' });
      }
    }

    if (phase === 'saving') {
      console.log(`[autopilot] Job ${jobId}: saving results`);

      const results = scores.map(s => s.result).filter(Boolean);
      if (results.length === 0) {
        await sb.from('autopilot_jobs').update({
          status: 'error',
          message: 'No se obtuvieron resultados',
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return NextResponse.json({ ok: true, done: true });
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

      // Save to evaluation_runs
      const runId = crypto.randomUUID();
      const totalTimeMs = results.reduce((sum, r) => sum + r.totalTimeMs, 0);

      await sb.from('evaluation_runs').insert({
        id: runId,
        timestamp: new Date().toISOString(),
        prompt_version: 'current',
        model: 'gpt-4o-mini',
        conversation_results: results,
        aggregate_scores: aggregate,
        total_conversations: results.length,
        perfect_conversations: results.filter(r => r.scores.overall >= 0.9).length,
        partial_conversations: results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
        failed_conversations: results.filter(r => r.scores.overall < 0.6).length,
        total_time_ms: totalTimeMs,
      });

      // Perfect score? Done.
      if (aggregate.overall >= 1.0) {
        await sb.from('autopilot_jobs').update({
          status: 'completed',
          phase: 'complete',
          eval_run_id: runId,
          aggregate_scores: aggregate,
          message: 'Score perfecto. No se requieren cambios.',
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return NextResponse.json({ ok: true, done: true });
      }

      // Move to diagnosis
      await sb.from('autopilot_jobs').update({
        phase: 'diagnosis',
        eval_run_id: runId,
        aggregate_scores: aggregate,
        message: 'Ejecutando diagnóstico AI...',
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      // Trigger diagnosis chunk
      triggerNextChunk(req, jobId);
      return NextResponse.json({ ok: true, next: 'diagnosis' });
    }

    if (phase === 'diagnosis') {
      console.log(`[autopilot] Job ${jobId}: running diagnosis`);

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
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return NextResponse.json({ ok: true, done: true });
      }

      const adjustments = diagnosis.proposedAdjustments || [];

      if (adjustments.length === 0) {
        await sb.from('autopilot_jobs').update({
          status: 'completed',
          phase: 'complete',
          message: 'Diagnóstico completado. Sin ajustes propuestos.',
          diagnosis_summary: diagnosis.summary,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);
        return NextResponse.json({ ok: true, done: true });
      }

      // Apply adjustments
      const { addRule, saveSnapshot } = await import('@/lib/chat/prompt-rules');
      saveSnapshot();

      let appliedCount = 0;
      for (const adj of adjustments) {
        if (!adj.proposedChange) continue;
        try {
          addRule(adj.target || 'extractor', adj.proposedChange, `Autopilot: ${adj.pattern}`);
          appliedCount++;
        } catch {
          // skip
        }
      }

      await sb.from('autopilot_jobs').update({
        phase: appliedCount > 0 ? 'reeval' : 'complete',
        status: appliedCount > 0 ? 'running' : 'completed',
        message: appliedCount > 0
          ? `${appliedCount} ajustes aplicados. Re-evaluando...`
          : 'Sin ajustes aplicables.',
        diagnosis_summary: diagnosis.summary,
        adjustments_applied: appliedCount,
        current_conversation: 0, // Reset for re-evaluation
        conversation_scores: [], // Clear for re-eval scores
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      if (appliedCount > 0) {
        triggerNextChunk(req, jobId);
      }
      return NextResponse.json({ ok: true, next: appliedCount > 0 ? 'reeval' : 'done' });
    }

    if (phase === 'reeval') {
      // Re-evaluate one conversation at a time
      if (convIndex < totalConvs) {
        const convName = allConversations[convIndex]?.name || `Conv ${convIndex + 1}`;
        console.log(`[autopilot] Job ${jobId}: re-eval ${convIndex + 1}/${totalConvs} — ${convName}`);

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
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        if (isLast) {
          // Compare pre vs post scores
          const reResults = newScores.map(s => s.result).filter(Boolean);
          const avg = (nums: number[]) =>
            nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

          const postScore = avg(reResults.map(r => r.scores.overall));
          const preScore = (job.aggregate_scores as { overall: number })?.overall ?? 0;

          if (postScore < preScore) {
            // Regressed — rollback
            const { rollbackToSnapshot } = await import('@/lib/chat/prompt-rules');
            rollbackToSnapshot();

            await sb.from('autopilot_jobs').update({
              status: 'completed',
              phase: 'complete',
              message: `Score bajó (${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%). Rollback aplicado.`,
              reeval_pre_score: preScore,
              reeval_post_score: postScore,
              reeval_improved: false,
              reeval_rolled_back: true,
              adjustments_applied: 0,
              updated_at: new Date().toISOString(),
            }).eq('id', jobId);
          } else {
            // Improved — save new run
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
              prompt_version: 'current',
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
              updated_at: new Date().toISOString(),
            }).eq('id', jobId);
          }

          return NextResponse.json({ ok: true, done: true });
        }

        // Trigger next re-eval conversation
        triggerNextChunk(req, jobId);
        return NextResponse.json({ ok: true, next: 'reeval' });
      }
    }

    // Fallback
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[autopilot] Job ${jobId} chunk error:`, e);

    await sb.from('autopilot_jobs').update({
      status: 'error',
      message: `Error: ${e instanceof Error ? e.message : 'Error desconocido'}`,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error' },
      { status: 500 },
    );
  }
}
