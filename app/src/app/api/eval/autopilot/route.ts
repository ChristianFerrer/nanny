import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import { diagnoseResults } from '@/lib/eval/diagnosis';
import { SYSTEM_PROMPT } from '@/lib/chat/processChat';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { MessageResult, ConversationResult, EvaluationRun } from '@/lib/eval/types';

export const maxDuration = 300;

function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ═══════════════════════════════════════════
        // FASE 1: Evaluación
        // ═══════════════════════════════════════════
        sendEvent(controller, encoder, 'phase', { phase: 'evaluation', message: 'Iniciando evaluación...' });

        const conversations = allConversations;
        sendEvent(controller, encoder, 'eval_start', { totalConversations: conversations.length });

        const results: ConversationResult[] = [];

        for (let i = 0; i < conversations.length; i++) {
          const conversation = conversations[i];
          const profile = profiles.find(p => p.id === conversation.profileId);
          if (!profile) {
            sendEvent(controller, encoder, 'conv_error', {
              index: i,
              name: conversation.name,
              error: `Perfil no encontrado: ${conversation.profileId}`,
            });
            continue;
          }

          sendEvent(controller, encoder, 'conv_start', {
            index: i,
            name: conversation.name,
            totalMessages: conversation.messages.length,
          });

          try {
            let recentMessages: string[] = [];
            let createdEvents: string[] = [];
            let createdTasks: string[] = [];
            let activeMedications: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pendingDetection: any = null;
            const messageResults: MessageResult[] = [];

            for (let msgIdx = 0; msgIdx < conversation.messages.length; msgIdx++) {
              const msg = conversation.messages[msgIdx];
              const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;
              const familyContext = buildFamilyContext(profile);
              const recentStr = recentMessages.slice(-15).join('\n') || 'Ninguno';

              const msgStart = Date.now();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let response: any = null;
              let error: string | undefined;

              try {
                response = await processChat({
                  message: msg.text,
                  familyContext,
                  recentMessages: recentStr,
                  existingEvents: createdEvents.join('\n') || 'Ninguno',
                  existingTasks: createdTasks.join('\n') || 'Ninguna',
                  activeMedications: activeMedications.join('\n') || 'Ninguno',
                  senderName,
                  pendingDetection,
                });
              } catch (e) {
                error = e instanceof Error ? e.message : String(e);
              }

              const responseTimeMs = Date.now() - msgStart;

              // Update state
              recentMessages = [...recentMessages, `${senderName}: ${msg.text}`];
              if (response) {
                if (response.should_respond && response.reply) {
                  recentMessages.push(`Nanny: ${response.reply}`);
                }
                if (response.confirmation) {
                  const conf = response.confirmation;
                  if (conf.type === 'event') {
                    createdEvents.push(`${conf.data.title} - ${conf.data.date_start || ''} (${conf.data.assigned_to || 'sin asignar'})`);
                  } else if (conf.type === 'task') {
                    createdTasks.push(`${conf.data.title} (${conf.data.assigned_to || 'sin asignar'})`);
                  } else if (conf.type === 'medication') {
                    activeMedications.push(`${conf.data.medication_name} - ${conf.data.frequency || ''}`);
                  }
                }
                pendingDetection = response.pending_detection || null;
              }

              messageResults.push({
                messageIndex: msgIdx,
                senderName,
                messageText: msg.text,
                response,
                responseTimeMs,
                error,
              });

              sendEvent(controller, encoder, 'msg_done', {
                index: i,
                msgIndex: msgIdx,
                totalMessages: conversation.messages.length,
              });
            }

            // Score
            const { detectionMatches, behaviorMatches, scores } = scoreConversation(
              conversation,
              messageResults
            );

            const result: ConversationResult = {
              conversationId: conversation.id,
              conversationName: conversation.name,
              profileId: conversation.profileId,
              messageResults,
              detectionMatches,
              behaviorMatches,
              scores,
              totalTimeMs: messageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
            };

            results.push(result);

            sendEvent(controller, encoder, 'conv_done', {
              index: i,
              name: conversation.name,
              score: scores.overall,
            });
          } catch (e) {
            sendEvent(controller, encoder, 'conv_error', {
              index: i,
              name: conversation.name,
              error: e instanceof Error ? e.message : 'Error',
            });
          }
        }

        if (results.length === 0) {
          sendEvent(controller, encoder, 'error', { message: 'No se obtuvieron resultados' });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // FASE 2: Guardar resultados
        // ═══════════════════════════════════════════
        sendEvent(controller, encoder, 'phase', { phase: 'saving', message: 'Guardando resultados...' });

        const avg = (nums: number[]) =>
          nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

        const aggregate = {
          precision: avg(results.map(r => r.scores.precision)),
          recall: avg(results.map(r => r.scores.recall)),
          ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
          behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
          overall: avg(results.map(r => r.scores.overall)),
        };

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        let savedRunId: string | null = null;

        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          const run: EvaluationRun = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            promptVersion: 'current',
            model: 'gpt-4o-mini',
            conversationResults: results,
            aggregateScores: aggregate,
            totalConversations: results.length,
            perfectConversations: results.filter(r => r.scores.overall >= 0.9).length,
            partialConversations: results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
            failedConversations: results.filter(r => r.scores.overall < 0.6).length,
            totalTimeMs: results.reduce((sum, r) => sum + r.totalTimeMs, 0),
          };

          const { error } = await supabase.from('evaluation_runs').insert({
            id: run.id,
            timestamp: run.timestamp,
            prompt_version: run.promptVersion,
            model: run.model,
            conversation_results: run.conversationResults,
            aggregate_scores: run.aggregateScores,
            total_conversations: run.totalConversations,
            perfect_conversations: run.perfectConversations,
            partial_conversations: run.partialConversations,
            failed_conversations: run.failedConversations,
            total_time_ms: run.totalTimeMs,
          });

          if (!error) {
            savedRunId = run.id;
          } else {
            sendEvent(controller, encoder, 'warning', { message: `Error guardando: ${error.message}` });
          }
        }

        sendEvent(controller, encoder, 'saved', { runId: savedRunId, aggregate });

        // Check if there are failures worth diagnosing
        const hasFailures = aggregate.overall < 1.0;
        if (!hasFailures) {
          sendEvent(controller, encoder, 'phase', { phase: 'complete', message: 'Score perfecto. No se requieren cambios.' });
          sendEvent(controller, encoder, 'done', { runId: savedRunId, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // FASE 3: Diagnóstico
        // ═══════════════════════════════════════════
        sendEvent(controller, encoder, 'phase', { phase: 'diagnosis', message: 'Ejecutando diagnóstico AI...' });

        let diagnosis;
        try {
          diagnosis = await diagnoseResults(results, SYSTEM_PROMPT);
        } catch (e) {
          sendEvent(controller, encoder, 'error', {
            message: `Error en diagnóstico: ${e instanceof Error ? e.message : 'Error'}`,
          });
          sendEvent(controller, encoder, 'done', { runId: savedRunId, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        sendEvent(controller, encoder, 'diagnosis_done', {
          summary: diagnosis.summary,
          failurePatterns: diagnosis.failurePatterns.length,
          proposedAdjustments: diagnosis.proposedAdjustments.length,
        });

        if (diagnosis.proposedAdjustments.length === 0) {
          sendEvent(controller, encoder, 'phase', { phase: 'complete', message: 'Diagnóstico sin ajustes propuestos.' });
          sendEvent(controller, encoder, 'done', { runId: savedRunId, aggregate, adjustmentsApplied: 0 });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════
        // FASE 4: Aplicar ajustes al prompt
        // ═══════════════════════════════════════════
        sendEvent(controller, encoder, 'phase', {
          phase: 'applying',
          message: `Aplicando ${diagnosis.proposedAdjustments.length} ajustes al prompt...`,
        });

        let appliedCount = 0;
        const supabaseAdmin = getSupabaseAdmin();

        for (let i = 0; i < diagnosis.proposedAdjustments.length; i++) {
          const adj = diagnosis.proposedAdjustments[i];

          if (!adj.currentPromptSection || !adj.proposedChange) {
            sendEvent(controller, encoder, 'adj_skip', {
              index: i,
              pattern: adj.pattern,
              reason: 'Sin sección actual o cambio propuesto',
            });
            continue;
          }

          sendEvent(controller, encoder, 'adj_start', {
            index: i,
            total: diagnosis.proposedAdjustments.length,
            pattern: adj.pattern,
          });

          try {
            // Get active prompt
            const { data: activePrompt } = await supabaseAdmin
              .from('system_prompts')
              .select('*')
              .eq('is_active', true)
              .single();

            const currentContent = activePrompt?.content || SYSTEM_PROMPT;
            const parentId = activePrompt?.id || null;

            if (!currentContent.includes(adj.currentPromptSection)) {
              sendEvent(controller, encoder, 'adj_skip', {
                index: i,
                pattern: adj.pattern,
                reason: 'Sección no encontrada en prompt actual (ya modificada)',
              });
              continue;
            }

            const newContent = currentContent.replace(adj.currentPromptSection, adj.proposedChange);
            const versionNum = activePrompt?.version_label
              ? parseInt(activePrompt.version_label.replace('v', '')) + 1
              : 1;
            const versionLabel = `v${versionNum}`;

            if (activePrompt?.id) {
              await supabaseAdmin
                .from('system_prompts')
                .update({ is_active: false })
                .eq('id', activePrompt.id);
            }

            const { data: newPrompt, error } = await supabaseAdmin
              .from('system_prompts')
              .insert({
                version_label: versionLabel,
                content: newContent,
                is_active: true,
                parent_version_id: parentId,
                change_description: `Autopilot: ${adj.pattern} - ${adj.expectedImpact}`,
              })
              .select()
              .single();

            if (error) {
              if (activePrompt?.id) {
                await supabaseAdmin
                  .from('system_prompts')
                  .update({ is_active: true })
                  .eq('id', activePrompt.id);
              }
              throw error;
            }

            appliedCount++;
            sendEvent(controller, encoder, 'adj_done', {
              index: i,
              pattern: adj.pattern,
              version: newPrompt.version_label,
            });
          } catch (e) {
            sendEvent(controller, encoder, 'adj_error', {
              index: i,
              pattern: adj.pattern,
              error: e instanceof Error ? e.message : 'Error',
            });
          }
        }

        // ═══════════════════════════════════════════
        // COMPLETO
        // ═══════════════════════════════════════════
        sendEvent(controller, encoder, 'phase', {
          phase: 'complete',
          message: `Pipeline completado. ${appliedCount} ajustes aplicados.`,
        });
        sendEvent(controller, encoder, 'done', {
          runId: savedRunId,
          aggregate,
          adjustmentsApplied: appliedCount,
          diagnosisSummary: diagnosis.summary,
        });
      } catch (e) {
        sendEvent(controller, encoder, 'error', {
          message: e instanceof Error ? e.message : 'Error fatal en autopilot',
        });
      } finally {
        controller.close();
      }
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
