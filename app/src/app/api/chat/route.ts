import { NextRequest, NextResponse } from 'next/server';
import { processChat } from '@/lib/chat/processChat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const result = await processChat({
      message: body.message || '',
      familyContext: body.familyContext || '',
      recentMessages: body.recentMessages || '',
      existingEvents: body.existingEvents || 'Ninguno',
      existingTasks: body.existingTasks || 'Ninguna',
      activeMedications: body.activeMedications || 'Ninguno',
      senderName: body.senderName || 'Padre',
      senderRole: body.senderRole || 'mama',
      pendingDetection: body.pendingDetection || null,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Chat API error:', error instanceof Error ? error.message : error);

    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    if (errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key')) {
      return NextResponse.json(
        { error: 'La API key de OpenAI es inválida. Verifica la configuración.' },
        { status: 401 }
      );
    }
    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('rate_limit')) {
      return NextResponse.json(
        { error: 'Se agotó la cuota de OpenAI o hay demasiadas solicitudes. Intenta en unos minutos.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Error al comunicarse con la IA. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
