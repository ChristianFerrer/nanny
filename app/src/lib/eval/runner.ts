/**
 * Runner: envía conversaciones sintéticas mensaje por mensaje al API de Nanny.
 *
 * Simula el flujo real: acumula recentMessages, lleva pendingDetection,
 * y registra eventos/tareas creados como contexto existente.
 */

import type {
  SyntheticConversation,
  MessageResult,
  ConversationResult,
} from './types';
import { profiles, buildFamilyContext } from './profiles';
import { scoreConversation } from './scorer';
import { processChat } from '@/lib/chat/processChat';

interface RunnerConfig {
  /** URL base del API - solo usado como fallback para fetch mode */
  baseUrl?: string;
  /** Delay entre mensajes para no saturar el API (ms) */
  delayBetweenMessages?: number;
  /** Si true, usa fetch HTTP en vez de llamada directa */
  useFetch?: boolean;
}

/**
 * Ejecuta una conversación completa contra el API de Nanny.
 */
export async function runConversation(
  conversation: SyntheticConversation,
  config: RunnerConfig
): Promise<ConversationResult> {
  const profile = profiles.find(p => p.id === conversation.profileId);
  if (!profile) throw new Error(`Perfil no encontrado: ${conversation.profileId}`);

  const familyContext = buildFamilyContext(profile);
  const messageResults: MessageResult[] = [];
  const recentMessages: string[] = [];
  const createdEvents: string[] = [];
  const createdTasks: string[] = [];
  const activeMedications: string[] = [];
  let pendingDetection: Record<string, unknown> | null = null;

  const startTime = Date.now();

  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;

    // Build recent messages string (last 15)
    const recentStr = recentMessages.slice(-15).join('\n') || 'Ninguno';

    const msgStart = Date.now();
    let response: MessageResult['response'] = null;
    let error: string | undefined;

    try {
      if (config.useFetch && config.baseUrl) {
        // HTTP fetch mode (for CLI usage)
        const requestBody = {
          message: msg.text,
          familyContext,
          recentMessages: recentStr,
          existingEvents: createdEvents.join('\n') || 'Ninguno',
          existingTasks: createdTasks.join('\n') || 'Ninguna',
          activeMedications: activeMedications.join('\n') || 'Ninguno',
          senderName,
          pendingDetection,
        };

        const res = await fetch(`${config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          error = `HTTP ${res.status}: ${await res.text()}`;
        } else {
          response = await res.json();
        }
      } else {
        // Direct call mode (for server-side / eval API route)
        const result = await processChat({
          message: msg.text,
          familyContext,
          recentMessages: recentStr,
          existingEvents: createdEvents.join('\n') || 'Ninguno',
          existingTasks: createdTasks.join('\n') || 'Ninguna',
          activeMedications: activeMedications.join('\n') || 'Ninguno',
          senderName,
          pendingDetection,
        });
        response = result;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const responseTimeMs = Date.now() - msgStart;

    // Add parent message to recent
    recentMessages.push(`${senderName}: ${msg.text}`);

    // Process response for context accumulation
    if (response) {
      // Add nanny response to recent messages
      if (response.should_respond && response.reply) {
        recentMessages.push(`Nanny: ${response.reply}`);
      }

      // Track created items
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

      // Update pending detection
      pendingDetection = response.pending_detection as Record<string, unknown> | null;
    }

    messageResults.push({
      messageIndex: i,
      senderName,
      messageText: msg.text,
      response,
      responseTimeMs,
      error,
    });

    // Delay between messages
    if (config.delayBetweenMessages && i < conversation.messages.length - 1) {
      await new Promise(r => setTimeout(r, config.delayBetweenMessages));
    }
  }

  const totalTimeMs = Date.now() - startTime;

  // Score the conversation
  const { detectionMatches, behaviorMatches, scores } = scoreConversation(
    conversation,
    messageResults
  );

  return {
    conversationId: conversation.id,
    conversationName: conversation.name,
    profileId: conversation.profileId,
    messageResults,
    detectionMatches,
    behaviorMatches,
    scores,
    totalTimeMs,
  };
}

/**
 * Ejecuta todas las conversaciones y retorna los resultados agregados.
 */
export async function runAllConversations(
  conversations: SyntheticConversation[],
  config: RunnerConfig
): Promise<{
  results: ConversationResult[];
  aggregate: ConversationResult['scores'];
  totalTimeMs: number;
}> {
  const results: ConversationResult[] = [];
  const startTime = Date.now();

  for (const conv of conversations) {
    const result = await runConversation(conv, config);
    results.push(result);
  }

  // Aggregate scores
  const aggregate = {
    precision: avg(results.map(r => r.scores.precision)),
    recall: avg(results.map(r => r.scores.recall)),
    ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
    behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
    falsePositiveRate: avg(results.map(r => r.scores.falsePositiveRate)),
    fieldAccuracy: {
      dateAccuracy: avg(results.map(r => r.scores.fieldAccuracy.dateAccuracy)),
      ownerAccuracy: avg(results.map(r => r.scores.fieldAccuracy.ownerAccuracy)),
      typeAccuracy: avg(results.map(r => r.scores.fieldAccuracy.typeAccuracy)),
    },
    overall: avg(results.map(r => r.scores.overall)),
  };

  return {
    results,
    aggregate,
    totalTimeMs: Date.now() - startTime,
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}
