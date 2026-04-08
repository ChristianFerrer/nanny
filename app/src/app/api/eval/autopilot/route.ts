import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult, ConversationResult } from '@/lib/eval/types';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minutes for full autopilot

/**
 * POST: Starts the autopilot pipeline using after().
 * Returns immediately — the pipeline runs independently of the client connection.
 * Results are saved to Supabase; client polls /api/eval/runs to detect completion.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const skipDiagnosis = body.skipDiagnosis === true;

  // Schedule the full pipeline to run AFTER the response is sent.
  // This means the client can close the browser, switch apps, etc.
  // The function continues running on the server for up to maxDuration.
  after(async () => {
    console.log('[autopilot] Pipeline started');

    try {
      await runAutopilotPipeline(skipDiagnosis);
      console.log('[autopilot] Pipeline completed successfully');
    } catch (e) {
      console.error('[autopilot] Pipeline failed:', e);
    }
  });

  // Return immediately — client doesn't need to stay connected
  return NextResponse.json({
    started: true,
    startedAt: new Date().toISOString(),
  });
}

async function runAutopilotPipeline(skipDiagnosis: boolean) {
  const avg = (nums: number[]) =>
    nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

  // ═══════════════════════════════════════════
  // PHASE 1: Run all conversations
  // ═══════════════════════════════════════════
  console.log('[autopilot] Phase 1: Evaluation');

  const results: ConversationResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < allConversations.length; i++) {
    const conversation = allConversations[i];
    const profile = profiles.find(p => p.id === conversation.profileId);
    if (!profile) continue;

    console.log(`[autopilot] Conversation ${i + 1}/${allConversations.length}: ${conversation.name}`);

    const state = {
      recentMessages: [] as string[],
      createdEvents: [] as string[],
      createdTasks: [] as string[],
      activeMedications: [] as string[],
      pendingDetection: null as unknown,
      messageResults: [] as MessageResult[],
    };

    let hasError = false;

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
        hasError = true;
      }

      const responseTimeMs = Date.now() - msgStart;

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
        responseTimeMs,
        error,
      });
    }

    if (!hasError) {
      const { detectionMatches, behaviorMatches, scores } = scoreConversation(
        conversation,
        state.messageResults,
      );

      results.push({
        conversationId: conversation.id,
        conversationName: conversation.name,
        profileId: conversation.profileId,
        messageResults: state.messageResults,
        detectionMatches,
        behaviorMatches,
        scores,
        totalTimeMs: state.messageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
      });
    }
  }

  if (results.length === 0) {
    console.error('[autopilot] No results obtained');
    return;
  }

  // ═══════════════════════════════════════════
  // PHASE 2: Save results
  // ═══════════════════════════════════════════
  console.log('[autopilot] Phase 2: Saving results');

  const totalTimeMs = Date.now() - startTime;

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

  let savedRunId: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const id = crypto.randomUUID();
      const { error } = await supabase.from('evaluation_runs').insert({
        id,
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
      if (!error) {
        savedRunId = id;
        console.log(`[autopilot] Saved run: ${id}, overall: ${Math.round(aggregate.overall * 100)}%`);
      } else {
        console.error('[autopilot] Save error:', error);
      }
    }
  } catch (e) {
    console.error('[autopilot] Save failed:', e);
  }

  // If perfect score or skip diagnosis, done
  if (aggregate.overall >= 1.0 || skipDiagnosis || !savedRunId) {
    console.log('[autopilot] Done (no diagnosis needed)');
    return;
  }

  // ═══════════════════════════════════════════
  // PHASE 3: Diagnosis
  // ═══════════════════════════════════════════
  console.log('[autopilot] Phase 3: Diagnosis');

  let diagnosis;
  try {
    const { diagnoseResults } = await import('@/lib/eval/diagnosis');
    const { CLASSIFIER_PROMPT_TEXT, EXTRACTOR_PROMPT_TEXT } = await import('@/app/api/eval/prompt/prompt-texts');
    diagnosis = await diagnoseResults(results, {
      classifier: CLASSIFIER_PROMPT_TEXT,
      extractor: EXTRACTOR_PROMPT_TEXT,
    });
    diagnosis.runId = savedRunId;
    console.log(`[autopilot] Diagnosis: ${diagnosis.proposedAdjustments?.length || 0} adjustments proposed`);
  } catch (e) {
    console.error('[autopilot] Diagnosis failed:', e);
    return;
  }

  const adjustments = diagnosis.proposedAdjustments || [];
  if (adjustments.length === 0) {
    console.log('[autopilot] No adjustments proposed');
    return;
  }

  // ═══════════════════════════════════════════
  // PHASE 4: Apply adjustments
  // ═══════════════════════════════════════════
  console.log(`[autopilot] Phase 4: Applying ${adjustments.length} adjustments`);

  const { addRule, saveSnapshot, rollbackToSnapshot } = await import('@/lib/chat/prompt-rules');
  saveSnapshot();

  let appliedCount = 0;
  for (let i = 0; i < adjustments.length; i++) {
    const adj = adjustments[i];
    if (!adj.proposedChange) continue;

    try {
      addRule(
        adj.target || 'extractor',
        adj.proposedChange,
        `Autopilot: ${adj.pattern}`,
      );
      appliedCount++;
      console.log(`[autopilot] Applied adjustment ${i + 1}: ${adj.pattern}`);
    } catch (e) {
      console.error(`[autopilot] Adjustment ${i + 1} failed:`, e);
    }
  }

  if (appliedCount === 0) {
    console.log('[autopilot] No adjustments applied');
    return;
  }

  // ═══════════════════════════════════════════
  // PHASE 5: Re-evaluation
  // ═══════════════════════════════════════════
  console.log('[autopilot] Phase 5: Re-evaluation');

  const reResults: ConversationResult[] = [];

  for (let i = 0; i < allConversations.length; i++) {
    const conversation = allConversations[i];
    const profile = profiles.find(p => p.id === conversation.profileId);
    if (!profile) continue;

    console.log(`[autopilot] Re-eval ${i + 1}/${allConversations.length}: ${conversation.name}`);

    const state = {
      recentMessages: [] as string[],
      createdEvents: [] as string[],
      createdTasks: [] as string[],
      activeMedications: [] as string[],
      pendingDetection: null as unknown,
      messageResults: [] as MessageResult[],
    };

    try {
      for (const msg of conversation.messages) {
        const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;
        const familyContext = buildFamilyContext(profile);
        const recentStr = state.recentMessages.slice(-15).join('\n') || 'Ninguno';
        const msgStart = Date.now();

        const response = await processChat({
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

        state.recentMessages.push(`${senderName}: ${msg.text}`);
        if (response?.should_respond && response.reply) {
          state.recentMessages.push(`Nanny: ${response.reply}`);
        }
        if (response?.confirmation) {
          const conf = response.confirmation;
          if (conf.type === 'event') state.createdEvents.push(`${conf.data.title}`);
          else if (conf.type === 'task') state.createdTasks.push(`${conf.data.title}`);
          else if (conf.type === 'medication') state.activeMedications.push(`${conf.data.medication_name}`);
        }
        state.pendingDetection = response?.pending_detection || null;

        state.messageResults.push({
          messageIndex: state.messageResults.length,
          senderName,
          messageText: msg.text,
          response,
          responseTimeMs: Date.now() - msgStart,
        });
      }

      const { detectionMatches, behaviorMatches, scores } = scoreConversation(conversation, state.messageResults);
      reResults.push({
        conversationId: conversation.id,
        conversationName: conversation.name,
        profileId: conversation.profileId,
        messageResults: state.messageResults,
        detectionMatches,
        behaviorMatches,
        scores,
        totalTimeMs: state.messageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
      });
    } catch (e) {
      console.error(`[autopilot] Re-eval conversation ${i + 1} failed:`, e);
    }
  }

  if (reResults.length === 0) {
    console.log('[autopilot] Re-evaluation produced no results');
    return;
  }

  const preScore = aggregate.overall;
  const postScore = avg(reResults.map(r => r.scores.overall));

  if (postScore < preScore) {
    // Regressed — rollback
    rollbackToSnapshot();
    console.log(`[autopilot] Score regressed: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%. Rolled back.`);
  } else {
    // Improved — save the new run
    console.log(`[autopilot] Score improved: ${Math.round(preScore * 100)}% → ${Math.round(postScore * 100)}%`);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const reTotalTimeMs = reResults.reduce((sum, r) => sum + r.totalTimeMs, 0);
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

        await supabase.from('evaluation_runs').insert({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          prompt_version: 'current',
          model: 'gpt-4o-mini',
          conversation_results: reResults,
          aggregate_scores: reAggregate,
          total_conversations: reResults.length,
          perfect_conversations: reResults.filter(r => r.scores.overall >= 0.9).length,
          partial_conversations: reResults.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
          failed_conversations: reResults.filter(r => r.scores.overall < 0.6).length,
          total_time_ms: reTotalTimeMs,
        });

        console.log('[autopilot] Re-evaluation saved');
      }
    } catch (e) {
      console.error('[autopilot] Failed to save re-evaluation:', e);
    }
  }

  console.log('[autopilot] Pipeline complete');
}
