/**
 * Helpers de zona horaria.
 *
 * El cron de morning-brief usa `families.timezone` para enviar el resumen a
 * las 8am LOCAL de cada familia. Detectamos la TZ del navegador en onboarding
 * y en /chat (auto-update silencioso si la familia nunca eligió una manual).
 */

export function detectBrowserTimezone(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
