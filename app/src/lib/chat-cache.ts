/**
 * Cache de mensajes del chat en localStorage para mostrar al instante al
 * abrir la app, sin "flash de chat vacío" mientras se hace fetch del server.
 *
 * Patrón inspirado en WhatsApp/Instagram:
 *   1. Al abrir el chat, primer render usa lo de localStorage (cero delay).
 *   2. En paralelo, fetch de los nuevos mensajes desde el último cacheado.
 *   3. Real-time vía Supabase mantiene la cache sincronizada en vivo.
 *
 * Seguridad multi-cuenta: si el familyId del server no matchea con el
 * persistido (ej. otro usuario se logueó en este device), la cache se
 * descarta antes de aplicarla.
 */

import type { Message } from './types';

const FAMILY_KEY = 'nanny:chat:lastFamilyId';
const MAX_MESSAGES = 100;

function messagesKey(familyId: string): string {
  return `nanny:chat:messages:${familyId}`;
}

export interface CachedChat {
  familyId: string;
  messages: Message[];
}

export function loadCachedChat(): CachedChat | null {
  if (typeof window === 'undefined') return null;
  try {
    const familyId = window.localStorage.getItem(FAMILY_KEY);
    if (!familyId) return null;
    const raw = window.localStorage.getItem(messagesKey(familyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return { familyId, messages: parsed as Message[] };
  } catch {
    return null;
  }
}

export function saveCachedChat(familyId: string, messages: Message[]): void {
  if (typeof window === 'undefined' || !familyId) return;
  try {
    const tail = messages.slice(-MAX_MESSAGES);
    window.localStorage.setItem(FAMILY_KEY, familyId);
    window.localStorage.setItem(messagesKey(familyId), JSON.stringify(tail));
  } catch {
    // localStorage lleno o deshabilitado — silent fail (la app sigue
    // funcionando con cache en memoria).
  }
}

/**
 * Limpia la cache. Llamar en logout o si detectamos que el familyId del
 * server cambió (otro usuario se logueó en este device).
 */
export function clearCachedChat(): void {
  if (typeof window === 'undefined') return;
  try {
    const familyId = window.localStorage.getItem(FAMILY_KEY);
    if (familyId) {
      window.localStorage.removeItem(messagesKey(familyId));
    }
    window.localStorage.removeItem(FAMILY_KEY);
  } catch {
    // ignore
  }
}
