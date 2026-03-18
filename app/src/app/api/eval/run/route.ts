import { NextRequest, NextResponse } from 'next/server';
import { allConversations } from '@/lib/eval/conversations/index';
import { runConversation } from '@/lib/eval/runner';

export const maxDuration = 60;

/**
 * GET: lista las conversaciones disponibles
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
    }))
  );
}

/**
 * POST: ejecuta UNA conversación y retorna el resultado.
 * Body: { conversationIndex: number }
 */
export async function POST(req: NextRequest) {
  try {
    const { conversationIndex } = await req.json();
    const idx = Number(conversationIndex);

    if (isNaN(idx) || idx < 0 || idx >= allConversations.length) {
      return NextResponse.json(
        { error: `Índice inválido: ${conversationIndex}. Rango: 0-${allConversations.length - 1}` },
        { status: 400 }
      );
    }

    const conversation = allConversations[idx];
    const result = await runConversation(conversation, {
      delayBetweenMessages: 200,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('Eval run error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
