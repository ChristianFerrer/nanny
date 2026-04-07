import { NextRequest, NextResponse } from 'next/server';
import { allConversations } from '@/lib/eval/conversations/index';
import { processChat } from '@/lib/chat/processChat';
import { profiles, buildFamilyContext } from '@/lib/eval/profiles';
import { scoreConversation } from '@/lib/eval/scorer';
import type { MessageResult } from '@/lib/eval/types';

export const maxDuration = 30;

/**
 * GET: lista las conversaciones disponibles con sus mensajes
 */
export async function GET() {
  return NextResponse.json(
    allConversations.map((c, i) => ({
      index: i,
      id: c.id,
      name: c.name,
      description: c.description,
      profileId: c.profileId,
      messageCount: c.messages.length,
      messages: c.messages.map(m => ({ sender: m.sender, text: m.text })),
    }))
  );
}

/**
 * POST: procesa UN SOLO mensaje de una conversación.
 * Body: { conversationIndex, messageIndex, state }
 * state = { recentMessages, createdEvents, createdTasks, activeMedications, pendingDetection }
 *
 * Returns: { response, state, done?, result? }
 * - Si es el último mensaje, incluye `done: true` y `result` con scores.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationIndex, messageIndex, state: inputState } = body;
    const convIdx = Number(conversationIndex);
    const msgIdx = Number(messageIndex);

    if (isNaN(convIdx) || convIdx < 0 || convIdx >= allConversations.length) {
      return NextResponse.json({ error: `Conversación inválida: ${convIdx}` }, { status: 400 });
    }

    const conversation = allConversations[convIdx];
    if (isNaN(msgIdx) || msgIdx < 0 || msgIdx >= conversation.messages.length) {
      return NextResponse.json({ error: `Mensaje inválido: ${msgIdx}` }, { status: 400 });
    }

    const profile = profiles.find(p => p.id === conversation.profileId);
    if (!profile) {
      return NextResponse.json({ error: `Perfil no encontrado: ${conversation.profileId}` }, { status: 500 });
    }

    // Restore state from previous messages
    const state = inputState || {
      recentMessages: [] as string[],
      createdEvents: [] as string[],
      createdTasks: [] as string[],
      activeMedications: [] as string[],
      pendingDetection: null,
      messageResults: [] as MessageResult[],
    };

    const msg = conversation.messages[msgIdx];
    const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;
    const familyContext = buildFamilyContext(profile);
    const recentStr = (state.recentMessages as string[]).slice(-15).join('\n') || 'Ninguno';

    const msgStart = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any = null;
    let error: string | undefined;

    try {
      response = await processChat({
        message: msg.text,
        familyContext,
        recentMessages: recentStr,
        existingEvents: (state.createdEvents as string[]).join('\n') || 'Ninguno',
        existingTasks: (state.createdTasks as string[]).join('\n') || 'Ninguna',
        activeMedications: (state.activeMedications as string[]).join('\n') || 'Ninguno',
        senderName,
        senderRole: 'role' in msg && msg.role === 'papa' ? 'papa' : 'mama',
        pendingDetection: state.pendingDetection,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const responseTimeMs = Date.now() - msgStart;

    // Update state
    const newRecentMessages = [...(state.recentMessages as string[]), `${senderName}: ${msg.text}`];
    const newCreatedEvents = [...(state.createdEvents as string[])];
    const newCreatedTasks = [...(state.createdTasks as string[])];
    const newActiveMedications = [...(state.activeMedications as string[])];
    let newPendingDetection = state.pendingDetection;

    if (response) {
      if (response.should_respond && response.reply) {
        newRecentMessages.push(`Nanny: ${response.reply}`);
      }
      if (response.confirmation) {
        const conf = response.confirmation;
        if (conf.type === 'event') {
          newCreatedEvents.push(`${conf.data.title} - ${conf.data.date_start || ''} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'task') {
          newCreatedTasks.push(`${conf.data.title} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'medication') {
          newActiveMedications.push(`${conf.data.medication_name} - ${conf.data.frequency || ''}`);
        }
      }
      newPendingDetection = response.pending_detection || null;
    }

    const messageResult: MessageResult = {
      messageIndex: msgIdx,
      senderName,
      messageText: msg.text,
      response,
      responseTimeMs,
      error,
    };

    const allMessageResults = [...(state.messageResults || []), messageResult];
    const isLast = msgIdx === conversation.messages.length - 1;

    const newState = {
      recentMessages: newRecentMessages,
      createdEvents: newCreatedEvents,
      createdTasks: newCreatedTasks,
      activeMedications: newActiveMedications,
      pendingDetection: newPendingDetection,
      messageResults: allMessageResults,
    };

    // If last message, score and return final result
    if (isLast) {
      const { detectionMatches, behaviorMatches, scores } = scoreConversation(
        conversation,
        allMessageResults
      );

      return NextResponse.json({
        messageResult,
        done: true,
        result: {
          conversationId: conversation.id,
          conversationName: conversation.name,
          profileId: conversation.profileId,
          messageResults: allMessageResults,
          detectionMatches,
          behaviorMatches,
          scores,
          totalTimeMs: allMessageResults.reduce((sum, mr) => sum + mr.responseTimeMs, 0),
        },
      });
    }

    return NextResponse.json({
      messageResult,
      done: false,
      state: newState,
    });
  } catch (e) {
    console.error('Eval run error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
