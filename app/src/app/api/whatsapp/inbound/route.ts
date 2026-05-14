/**
 * /api/whatsapp/inbound — Webhook entrante de Meta WhatsApp Business API.
 *
 * Status: SKELETON (Sprint 0). Implementación real en Sprint 4b.
 *
 * Cuando esté completo, este endpoint:
 *   1. Valida la firma de Meta (`hub.signature` / `X-Hub-Signature-256`)
 *   2. Parsea el payload del webhook (mensajes entrantes desde contactos)
 *   3. Hace match contra `support_contacts.phone_whatsapp` para identificar
 *      la familia
 *   4. Invoca un mini LLM call (Claude) para interpretar la respuesta humana
 *      → { intent, parsed_response }
 *   5. Persiste en `whatsapp_conversations` (direction='inbound')
 *   6. Si es respuesta crítica (confirma logística, opt-in/out), dispara
 *      decision_agent event-triggered para que Nanny actúe
 *
 * Ver: AGENT-REWRITE-PLAN.md sección 6 (Sprint 4b) y NANNY-VISION.md §7.
 *
 * Meta verification: El GET handler responde al challenge de verificación del
 * webhook. Eso sí lo implementamos en este skeleton porque Meta lo requiere
 * antes de poder asociar el webhook con la app.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Meta verification challenge — debe responder con hub.challenge cuando
// hub.mode='subscribe' y hub.verify_token coincide con el configurado.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    status: 'not_implemented',
    message: 'WhatsApp inbound webhook skeleton — implementación pendiente en Sprint 4b',
    sprint: 'AGENT-REWRITE Sprint 4b',
  }, { status: 501 });
}
