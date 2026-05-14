/**
 * /api/cron/nanny-wake — Decision Agent trigger.
 *
 * Status: SKELETON (Sprint 0). Implementación real en Sprint 1.
 *
 * Cuando esté completo, este endpoint:
 *   1. Itera familias activas
 *   2. Para cada una decide si estamos en uno de los 4 momentos clave del día
 *      (7am / 12:30 / 5pm / 9pm en la timezone de la familia) o es un event-trigger
 *   3. Si corresponde, arma el contexto (perfil, agenda 48h, mensajes 24h,
 *      patrones, preferencias, learning queue) e invoca a Claude Sonnet 4.6
 *      con prompt caching
 *   4. Procesa la decision { intervene, message, delivery, priority }
 *   5. Si intervene=true → escribe en chat / dispara WhatsApp / manda push
 *
 * Ver: AGENT-REWRITE-PLAN.md sección 3 (Sprint 1) y NANNY-VISION.md §6.
 *
 * Auth: igual que otros crons — query param `?secret=<CRON_SECRET>` o header
 *       `x-cron-secret: <CRON_SECRET>`.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth check
  const url = new URL(req.url);
  const secretFromQuery = url.searchParams.get('secret');
  const secretFromHeader = req.headers.get('x-cron-secret');
  const isVercelCron = req.headers.get('x-vercel-cron') !== null;
  const validSecret = process.env.CRON_SECRET;

  if (!isVercelCron && validSecret && secretFromQuery !== validSecret && secretFromHeader !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'not_implemented',
    message: 'Decision Agent skeleton — implementación pendiente en Sprint 1',
    sprint: 'AGENT-REWRITE Sprint 1',
  }, { status: 501 });
}
