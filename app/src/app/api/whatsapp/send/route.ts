/**
 * /api/whatsapp/send — Endpoint interno para enviar mensajes WhatsApp.
 *
 * Status: SKELETON (Sprint 0). Implementación real en Sprint 4b.
 *
 * Cuando esté completo, este endpoint (llamado por el decision_agent o
 * por flows de consentimiento, NUNCA por el cliente browser):
 *   1. Valida auth interna (CRON_SECRET o token de servicio)
 *   2. Recibe { family_id, contact_id, message_text, intent, related_event_id }
 *   3. Resuelve plantilla si es primer mensaje (consent_request) o usa session
 *      message si la conversación ya está abierta dentro de 24h
 *   4. Llama Meta Graph API con WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN
 *   5. Persiste en `whatsapp_conversations` (direction='outbound')
 *   6. Retorna el meta_message_id para tracking
 *
 * Ver: AGENT-REWRITE-PLAN.md sección 6 (Sprint 4b) y NANNY-VISION.md §7.
 *
 * Privacidad: el endpoint NO recibe ni envía info adicional. Solo el mensaje
 * estrictamente necesario. Cualquier intento de incluir info no permitida se
 * filtra en el decision_agent antes de llamar acá.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    status: 'not_implemented',
    message: 'WhatsApp send skeleton — implementación pendiente en Sprint 4b',
    sprint: 'AGENT-REWRITE Sprint 4b',
  }, { status: 501 });
}
