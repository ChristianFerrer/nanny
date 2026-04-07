import { NextRequest } from 'next/server';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult, ConversationResult } from '@/lib/eval/types';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minutes for full autopilot

/**
 * POST: Runs the FULL autopilot pipeline server-side, streaming progress via SSE.
 * The client just connects and renders — no timers, no background tab issues.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const skipDiagnosis = body.skipDiagnosis === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // ═══════════════════════════════════════════
        // PHASE 1: Run all conversations
        // ═══════════════════════════════════════════
        send('phase', { phase: 'evaluation', message: 'Ejecutando evaluación...' });

        const results: ConversationResult[] = [];
        const startTime = Date.now();

        for (let i = 0; i < allConversations.length; i++) {
          const conversation = allConversations[i];
          const profile = profiles.find(p => p.id === conversation.profileId);
          if (!profile) continue;

          send('conversation', {
            index: i,
            name: conversation.name,
            status: 'running',
            total: allConversations.length,
          });

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
            }

            const responseTimeMs = Date.now() - msgStart;

            // Update conversation state
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

            send('message_progress', {
              conversationIndex: i,
              messageIndex: msgIdx + 1,
              totalMessages: conversation.messages.length,
            });
          }

          if (!hasError) {
            const { detectionMatches, behaviorMatches, scores } = scoreConversation(
              conversation,
              state.messageResults
            );

            const result: ConversationResult = {
              conversationId: conversation.id,
              conversationName: conversation.name,
              profileId: conversation.profileId,
              messageResults: state.messageResults,
              detectionMatches,
              behaviorMatches,
              scores,
              totalTimeMs: state.messageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
            };

            results.push(result);
            send('conversation', {
              index: i,
              name: conversation.name,
              status: 'done',
              score: scores.overall,
              total: allConversations.length,
            });
          }
        }

        if (results.length === 0) {
          send('error', { message: 'No se obtuvieron resultados' });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // PHASE 2: Save results
        // ═══════════════════════════════════════════
        send('phase', { phase: 'saving', message: 'Guardando resultados...' });

        const totalTimeMs = Date.now() - startTime;
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
            if (!error) savedRunId = id;
          }
        } catch {
          // continue
        }

        send('saved', { runId: savedRunId, aggregate });

        // If perfect score or skip diagnosis, finish
        if (aggregate.overall >= 1.0 || skipDiagnosis) {
          send('phase', { phase: 'complete', message: skipDiagnosis ? 'Evaluación completada.' : 'Score perfecto. No se requieren cambios.' });
          send('result', { runId: savedRunId, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        if (!savedRunId) {
          send('phase', { phase: 'complete', message: 'No se pudo guardar el run, diagnóstico omitido.' });
          send('result', { runId: null, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // PHASE 3: Diagnosis
        // ═══════════════════════════════════════════
        send('phase', { phase: 'diagnosis', message: 'Ejecutando diagnóstico AI...' });

        let diagnosis;
        try {
          const { diagnoseResults } = await import('@/lib/eval/diagnosis');
          const { CLASSIFIER_PROMPT_TEXT, EXTRACTOR_PROMPT_TEXT } = await import('@/app/api/eval/prompt/prompt-texts');
          diagnosis = await diagnoseResults(results.map(r => ({
            ...r,
          })), {
            classifier: CLASSIFIER_PROMPT_TEXT,
            extractor: EXTRACTOR_PROMPT_TEXT,
          });
          diagnosis.runId = savedRunId;
        } catch (e) {
          send('phase', { phase: 'complete', message: `Diagnóstico falló: ${e instanceof Error ? e.message : 'Error'}` });
          send('result', { runId: savedRunId, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        send('diagnosis', {
          summary: diagnosis.summary,
          failurePatterns: diagnosis.failurePatterns?.length || 0,
          proposedAdjustments: diagnosis.proposedAdjustments?.length || 0,
        });

        const adjustments = diagnosis.proposedAdjustments || [];
        if (adjustments.length === 0) {
          send('phase', { phase: 'complete', message: 'Diagnóstico sin ajustes propuestos.' });
          send('result', { runId: savedRunId, aggregate, adjustmentsApplied: 0, diagnosisSummary: diagnosis.summary });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // PHASE 4: Apply adjustments
        // ═══════════════════════════════════════════
        send('phase', { phase: 'applying', message: `Aplicando ${adjustments.length} ajustes...` });

        // Save snapshot for rollback
        const { addRule, saveSnapshot, rollbackToSnapshot } = await import('@/lib/chat/prompt-rules');
        saveSnapshot();

        let appliedCount = 0;
        for (let i = 0; i < adjustments.length; i++) {
          const adj = adjustments[i];
          if (!adj.proposedChange) {
            send('adjustment', { index: i, pattern: adj.pattern || `Ajuste ${i+1}`, status: 'skipped', reason: 'Sin cambio' });
            continue;
          }

          send('adjustment', { index: i, pattern: adj.pattern || `Ajuste ${i+1}`, status: 'applying' });

          try {
            addRule(
              adj.target || 'extractor',
              adj.proposedChange,
              `Autopilot: ${adj.pattern}`,
            );
            appliedCount++;
            send('adjustment', { index: i, pattern: adj.pattern || `Ajuste ${i+1}`, status: 'done' });
          } catch (e) {
            send('adjustment', { index: i, pattern: adj.pattern || `Ajuste ${i+1}`, status: 'error', reason: e instanceof Error ? e.message : 'Error' });
          }
        }

        // ═══════════════════════════════════════════
        // PHASE 5: Re-evaluation
        // ═══════════════════════════════════════════
        if (appliedCount > 0) {
          send('phase', { phase: 'reeval', message: 'Re-evaluando con prompt ajustado...' });

          const reResults: ConversationResult[] = [];

          for (let i = 0; i < allConversations.length; i++) {
            const conversation = allConversations[i];
            const profile = profiles.find(p => p.id === conversation.profileId);
            if (!profile) continue;

            send('reeval_progress', { index: i, total: allConversations.length, name: conversation.name });

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
            } catch {
              // skip failed
            }
          }

          if (reResults.length > 0) {
            const postAggregate = {
              precision: avg(reResults.map(r => r.scores.precision)),
              recall: avg(reResults.map(r => r.scores.recall)),
              overall: avg(reResults.map(r => r.scores.overall)),
            };

            const preScore = aggregate.overall;
            const postScore = postAggregate.overall;

            if (postScore < preScore) {
              // Regressed — rollback
              rollbackToSnapshot();
              send('reeval_result', { preScore, postScore, improved: false, rolledBack: true });
              send('phase', { phase: 'complete', message: `Score bajó (${Math.round(preScore*100)}% → ${Math.round(postScore*100)}%). Rollback aplicado.` });
              send('result', { runId: savedRunId, aggregate, adjustmentsApplied: 0, diagnosisSummary: diagnosis.summary, reeval: { preScore, postScore, improved: false, rolledBack: true } });
            } else {
              // Improved — save
              send('reeval_result', { preScore, postScore, improved: true, rolledBack: false });
              send('phase', { phase: 'complete', message: `Score mejoró: ${Math.round(preScore*100)}% → ${Math.round(postScore*100)}%` });
              send('result', { runId: savedRunId, aggregate: { ...aggregate, overall: postScore }, adjustmentsApplied: appliedCount, diagnosisSummary: diagnosis.summary, reeval: { preScore, postScore, improved: true, rolledBack: false } });
            }
          } else {
            send('phase', { phase: 'complete', message: 'Re-evaluación sin resultados.' });
            send('result', { runId: savedRunId, aggregate, adjustmentsApplied: appliedCount, diagnosisSummary: diagnosis.summary });
          }
        } else {
          send('phase', { phase: 'complete', message: 'No se aplicaron ajustes.' });
          send('result', { runId: savedRunId, aggregate, adjustmentsApplied: 0, diagnosisSummary: diagnosis.summary });
        }
      } catch (e) {
        send('error', { message: e instanceof Error ? e.message : 'Error desconocido' });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
