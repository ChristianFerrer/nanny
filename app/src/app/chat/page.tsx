'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot, CalendarDays, CheckSquare, Bell, X, Pill, RefreshCw, Thermometer, ListChecks, CreditCard, Car, Clock, AlertTriangle, ChevronRight, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinIcon, User as UserIcon, Reply, Search, Repeat } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useRouter } from 'next/navigation';
import { getMessages, getNewMessages, addMessage, addEvent, addTask, addMedication, getMedications, getParents, getChildren, getFamily, getEvents, getTasks, getRoutines, getRoutineExceptions, addRoutine, addRoutineException, getCurrentParentId, hasFamily, getCachedFamilyId, getCachedSnapshot, updateFamily, invalidateTableCache } from '@/lib/store';
import { registerPushNotifications, sendPushToFamily } from '@/lib/push';
import { validateNannyResponse } from '@/lib/validation';
import { getSupabase } from '@/lib/supabase';
import { detectBrowserTimezone } from '@/lib/timezone';
import { loadCachedChat, saveCachedChat, clearCachedChat } from '@/lib/chat-cache';
import { useRealtimeFamily } from '@/lib/realtime';
import { formatAge } from '@/lib/age';
import { callChatStream } from '@/lib/chat-stream';
import type { Message, Parent, Child, FamilyEvent, Task, Medication, Routine, RoutineException, NannyIntent } from '@/lib/types';

// --- Onboarding types ---
interface OnboardingExtracted {
  parent_name: string | null;
  parent_role: 'mama' | 'papa' | null;
  children: { name: string; age: number }[];
  family_name: string | null;
  has_partner: boolean | null;
  partner_name: string | null;
  partner_phone: string | null;
}
const CHILD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

/**
 * Mapea códigos de error del SSE del chat a mensajes amigables para el
 * usuario. NUNCA mostramos el error.message crudo (puede contener tokens,
 * org IDs, stack traces).
 */
function errorCodeToFriendlyMessage(code: string, _rawMessage?: string): string {
  switch (code) {
    case 'OPENAI_QUOTA':
      return 'Nanny está saturada de mensajes. Probá de nuevo en unos segundos.';
    case 'OPENAI_KEY':
      return 'Hubo un problema con la configuración del servicio.';
    case 'HTTP':
      return 'Sin conexión con Nanny. Intentalo de nuevo.';
    default:
      return 'Ups, Nanny tuvo un problema. Intentalo de nuevo.';
  }
}

// --- Swipeable message wrapper for reply gesture ---
function SwipeableMessage({ onSwipe, children: kids }: { onSwipe: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const triggered = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = false;
    triggered.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    if (dx > 5) return;
    const absDx = Math.abs(dx);
    if (absDx > 10) swiping.current = true;
    if (!swiping.current) return;

    const offset = Math.max(-80, dx);
    currentX.current = offset;
    if (ref.current) {
      ref.current.style.transform = `translateX(${offset}px)`;
      ref.current.style.transition = 'none';
    }

    if (absDx >= 60 && !triggered.current) {
      triggered.current = true;
      if (navigator.vibrate) navigator.vibrate(10);
    }
  };

  const onTouchEnd = () => {
    if (ref.current) {
      ref.current.style.transform = 'translateX(0)';
      ref.current.style.transition = 'transform 0.2s ease-out';
    }
    if (triggered.current) {
      onSwipe();
    }
    swiping.current = false;
    triggered.current = false;
  };

  return (
    <div className="relative overflow-hidden group">
      {/* Reply icon revealed behind the message (swipe) */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)] opacity-40 pointer-events-none">
        <Reply size={20} />
      </div>
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative will-change-transform"
        style={{ backgroundColor: 'transparent' }}
      >
        {kids}
      </div>
      {/* A11y: teclado-friendly reply button (visible on focus) */}
      <button
        type="button"
        onClick={onSwipe}
        aria-label="Responder a este mensaje"
        className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-1/2 focus:-translate-y-1/2 focus:bg-[var(--nanny-purple)] focus:text-white focus:rounded-full focus:px-3 focus:py-1 focus:text-caption focus:font-semibold focus:z-10"
      >
        Responder
      </button>
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  // Initialize from cache to avoid flash on revisit.
  // Prioridad: localStorage (sobrevive entre sesiones del browser) > snapshot
  // en memoria (módulo). Esto es lo que da la sensación WhatsApp/Instagram de
  // ver el chat al toque al abrir la app, sin "carga".
  const _snap = getCachedSnapshot();
  const _cachedChat = typeof window !== 'undefined' ? loadCachedChat() : null;
  const [messages, setMessages] = useState<Message[]>(
    _cachedChat?.messages || _snap?.messages || []
  );
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [routines, setRoutines] = useState<Routine[]>(_snap?.routines || []);
  const [routineExceptions, setRoutineExceptions] = useState<RoutineException[]>(_snap?.routineExceptions || []);
  const [familyId, setFamilyId] = useState<string>(_snap?.family?.id || '');
  const [input, setInput] = useState('');
  const [currentParent, setCurrentParent] = useState<string>(_snap?.currentParentId || '');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const [pushStatus, setPushStatus] = useState<'idle' | 'prompt' | 'granted' | 'denied'>('idle');
  const [toast, setToast] = useState<{ text: string; href: string } | null>(null);
  // showHeaderMenu eliminado: el header del chat ya no tiene menú "..." desde
  // que la navegación vive en el bottom nav y la config en el gear ⚙.
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingMedConfirm, setPendingMedConfirm] = useState<{
    messageId: string;
    data: Record<string, unknown>;
    childName: string;
  } | null>(null);
  const [editingMedTimes, setEditingMedTimes] = useState<string[] | null>(null);
  const [pendingDetection, setPendingDetection] = useState<{
    type: string;
    partial_data: Record<string, unknown>;
    missing: string[];
    summary: string;
  } | null>(null);
  const [catchingUp, setCatchingUp] = useState(false);
  const [nannyThinking, setNannyThinking] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(!!_snap);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // --- Onboarding state ---
  const [onboardingMode, setOnboardingMode] = useState(false);
  const [onboardingExtracted, setOnboardingExtracted] = useState<OnboardingExtracted>({
    parent_name: null, parent_role: null, children: [], family_name: null,
    has_partner: null, partner_name: null, partner_phone: null,
  });
  const [onboardingSending, setOnboardingSending] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingAuthUserId, setOnboardingAuthUserId] = useState<string | null>(null);
  const [onboardingAuthEmail, setOnboardingAuthEmail] = useState('');
  const onboardingInitiated = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  // iOS focus hack: translate input off-screen before focus so iOS has nothing to scroll to
  const focusWithoutScroll = useCallback(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    el.style.transform = 'translateY(-8000px)';
    el.focus();
    requestAnimationFrame(() => {
      el.style.transform = 'none';
    });
  }, []);

  // Intercept touch on input to apply the focus hack before iOS can scroll
  const handleInputTouchEnd = useCallback((e: React.TouchEvent) => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    e.preventDefault();
    focusWithoutScroll();
  }, [focusWithoutScroll]);

  // Mark chat page + lock body to prevent iOS viewport scroll
  useEffect(() => {
    document.body.setAttribute('data-page', 'chat');
    const html = document.documentElement;
    const body = document.body;
    html.style.position = 'fixed';
    html.style.top = '0';
    html.style.width = '100%';
    html.style.height = '100%';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.overflow = 'hidden';

    return () => {
      document.body.removeAttribute('data-page');
      html.style.position = '';
      html.style.top = '';
      html.style.width = '';
      html.style.height = '';
      html.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.height = '';
      body.style.overflow = '';
    };
  }, []);

  // iOS PWA keyboard fix: pin container to the visual viewport
  // On every resize/scroll, reset window scroll to 0 and match container to visual viewport.
  // Como ahora /chat también muestra el bottom nav, restamos su altura para
  // que el composer no quede tapado por la barra de tabs.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function getNavHeight(): number {
      const nav = document.querySelector('.bottom-nav') as HTMLElement | null;
      return nav ? nav.offsetHeight : 0;
    }

    function updateLayout() {
      const vv = window.visualViewport;
      // Force iOS back to top — undo any layout viewport scroll
      window.scrollTo(0, 0);
      const navH = getNavHeight();
      if (vv) {
        // Cuando el teclado abre, vv.height se reduce. Solo restamos nav si
        // hay altura suficiente — si vv ya es chico (teclado abierto), el
        // nav queda detrás del teclado y restar duplicaría el descuento.
        const keyboardOpen = vv.height < window.innerHeight - 100;
        el!.style.height = `${vv.height - (keyboardOpen ? 0 : navH)}px`;
        el!.style.top = `${vv.offsetTop}px`;
      } else {
        el!.style.height = `${window.innerHeight - navH}px`;
        el!.style.top = '0px';
      }
    }

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateLayout);
      vv.addEventListener('scroll', updateLayout);
    }
    window.addEventListener('resize', updateLayout);
    updateLayout();

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateLayout);
        vv.removeEventListener('scroll', updateLayout);
      }
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  // Buffer: agrupa mensajes consecutivos del mismo sender antes de procesar
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferedTextsRef = useRef<string[]>([]);
  const lastParentMsgRef = useRef<Message | null>(null);

  const loadData = useCallback(async () => {
    try {
      // Fast path: if we already have family data cached, skip auth checks
      const cachedFamily = getCachedFamilyId();
      if (!cachedFamily) {
        // First load — check auth
        const { data: { user } } = await getSupabase().auth.getUser();
        if (!user) { window.location.href = '/login'; return; }

        // Check if user has a family (safe call, doesn't throw)
        let familyExists = await hasFamily();

        // Retry pending invite from localStorage if no family yet — covers cases
        // where /api/join-family failed silently right after signup (cookie race,
        // email-confirmation redirect that stripped the URL param, etc.)
        if (!familyExists && typeof window !== 'undefined') {
          let pendingInvite: string | null = null;
          try { pendingInvite = window.localStorage.getItem('nanny:pendingInvite'); } catch {}
          if (pendingInvite) {
            try {
              const joinRes = await fetch('/api/join-family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ familyId: pendingInvite }),
              });
              const joinData = await joinRes.json();
              if (joinRes.ok && joinData.success) {
                try { window.localStorage.removeItem('nanny:pendingInvite'); } catch {}
                familyExists = true;
              } else if (joinData.code === 'FAMILY_NOT_FOUND') {
                try { window.localStorage.removeItem('nanny:pendingInvite'); } catch {}
              }
            } catch {
              // network glitch — leave the invite in storage for the next try
            }
          }
        }

        if (!familyExists) {
          setOnboardingMode(true);
          setDataLoaded(true);
          setOnboardingAuthUserId(user.id);
          setOnboardingAuthEmail(user.email || '');
          return;
        }
      }

      // Family exists — load all data (hits cache if fresh).
      // Para mensajes invalidamos el cache: el chat necesita SIEMPRE la versión
      // más fresca, sino el TTL puede tener una ventana ciega y los mensajes
      // del otro padre llegados en los últimos 30s no aparecen hasta que vence
      // (el síntoma reportado: "los últimos 2 mensajes aparecen segundos
      // después como segunda carga").
      invalidateTableCache('messages');
      const [fam, msgs, prts, chld, evts, tsks, meds, rts, rex] = await Promise.all([
        getFamily(), getMessages(), getParents(), getChildren(), getEvents(), getTasks(), getMedications(),
        getRoutines(), getRoutineExceptions(),
      ]);
      if (!fam) { window.location.href = '/login'; return; }
      setFamilyId(fam.id);
      // Si la familia del server cambió respecto a la cacheada en localStorage
      // (otro usuario se logueó en este device), descartamos los mensajes
      // viejos para no mostrar datos de otro hogar.
      if (_cachedChat && _cachedChat.familyId !== fam.id) {
        clearCachedChat();
      }
      // Mergear los msgs del server con los que ya estaban en state (de la
      // cache local) para no perder los que ya se mostraron, y mantener el
      // orden por created_at.
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id));
        const merged = [...prev, ...msgs.filter(m => !seen.has(m.id))];
        merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return merged;
      });
      setParents(prts);
      setChildren(chld);
      setEvents(evts);
      setTasks(tsks);
      setMedications(meds);
      setRoutines(rts);
      setRoutineExceptions(rex);
      if (prts.length > 0 && !currentParent) {
        const myParentId = getCurrentParentId();
        const matchedParent = myParentId && prts.find(p => p.id === myParentId);
        setCurrentParent(matchedParent ? matchedParent.id : prts[0].id);
      }
      // Auto-detectar TZ del navegador y actualizar silenciosamente la familia
      // si nadie eligió una manualmente. Soporta el caso donde la familia se
      // creó antes de tener TZ y el caso donde un padre viaja temporalmente
      // (no hace nada si timezone_set_manually=true).
      if (fam && !fam.timezone_set_manually) {
        const browserTz = detectBrowserTimezone();
        if (browserTz && browserTz !== fam.timezone) {
          updateFamily({ timezone: browserTz }).catch(err => {
            console.warn('[chat] silent TZ auto-update failed:', err);
          });
        }
      }
      setDataLoaded(true);
    } catch {
      window.location.href = '/login';
    }
  }, [currentParent]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!initialScrollDone.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      if (messages.length > 0) initialScrollDone.current = true;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prevH = vv.height;
    const onResize = () => {
      // Keyboard opened (height decreased significantly)
      if (vv.height < prevH - 50) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        }, 150);
      }
      prevH = vv.height;
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // --- Onboarding: start conversation ---
  useEffect(() => {
    if (!onboardingMode || onboardingInitiated.current) return;
    onboardingInitiated.current = true;

    const startOnboarding = async () => {
      setNannyThinking(true);
      try {
        const res = await fetch('/api/onboarding-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '[INICIO - el usuario acaba de crear su cuenta y llegó al chat. Salúdalo y comienza preguntando su nombre.]' }],
          }),
        });
        const data = await res.json();
        const greeting = data.reply || '¡Hola! Soy Nanny 👋 Voy a ayudarte a organizar la vida de tus hijos. ¿Cómo te llamas?';
        if (data.extracted) setOnboardingExtracted(data.extracted);
        setMessages([{
          id: crypto.randomUUID(), family_id: '', sender_id: null, sender_type: 'nanny',
          content: greeting, message_type: 'text', metadata: { intent: 'CHAT', onboarding: true },
          created_at: new Date().toISOString(),
        }]);
      } catch {
        setMessages([{
          id: crypto.randomUUID(), family_id: '', sender_id: null, sender_type: 'nanny',
          content: '¡Hola! Soy Nanny 👋 Voy a ayudarte a organizar la vida de tus hijos. ¿Cómo te llamas?',
          message_type: 'text', metadata: { intent: 'CHAT', onboarding: true },
          created_at: new Date().toISOString(),
        }]);
      }
      setNannyThinking(false);
    };
    startOnboarding();
  }, [onboardingMode]);

  // --- Onboarding: send message ---
  const sendOnboardingMessage = async () => {
    const text = input.trim();
    if (!text || onboardingSending || onboardingSaving) return;

    // Add user message to the same messages state
    const userMsg: Message = {
      id: crypto.randomUUID(), family_id: '', sender_id: 'onboarding-user', sender_type: 'parent',
      content: text, message_type: 'text', metadata: { onboarding: true },
      created_at: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setNannyThinking(true);

    try {
      // Build conversation for the API (role/content pairs)
      const apiMessages = updatedMessages.map(m => ({
        role: m.sender_type === 'nanny' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      const res = await fetch('/api/onboarding-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();

      if (data.reply) {
        const nannyMsg: Message = {
          id: crypto.randomUUID(), family_id: '', sender_id: null, sender_type: 'nanny',
          content: data.reply, message_type: 'text', metadata: { intent: 'CHAT', onboarding: true },
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, nannyMsg]);
        if (data.extracted) setOnboardingExtracted(data.extracted);

        if (data.confirmed && data.extracted) {
          // Include the final nanny reply in the conversation to persist
          const allMsgs = [...updatedMessages, nannyMsg];
          await saveOnboardingFamily(data.extracted, allMsgs);
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), family_id: '', sender_id: null, sender_type: 'nanny',
        content: 'Ups, hubo un error. ¿Puedes intentar de nuevo?',
        message_type: 'text', metadata: { intent: 'CHAT', onboarding: true },
        created_at: new Date().toISOString(),
      }]);
    }
    setNannyThinking(false);
    focusWithoutScroll();
  };

  // --- Onboarding: save family ---
  const saveOnboardingFamily = async (data: OnboardingExtracted, conversationMsgs: Message[]) => {
    setOnboardingSaving(true);
    try {
      const parentName = data.parent_name || onboardingAuthEmail.split('@')[0] || 'Padre';
      const parentRole = data.parent_role || 'mama';
      const familyName = data.family_name || `Familia ${parentName}`;

      const childrenWithDates = data.children.map((c, i) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - c.age);
        return {
          name: c.name,
          birth_date: d.toISOString().split('T')[0],
          emoji: CHILD_COLORS[i % CHILD_COLORS.length],
          school: null, teacher: null, grade: null, allergies: [],
        };
      });

      // Build parents array — primary parent + optional partner
      const parentsToCreate: { name: string; role: string; avatar_emoji: string; phone?: string }[] = [
        { name: parentName, role: parentRole, avatar_emoji: parentRole },
      ];
      if (data.has_partner && data.partner_name) {
        const partnerRole = parentRole === 'mama' ? 'papa' : 'mama';
        parentsToCreate.push({
          name: data.partner_name,
          role: partnerRole,
          avatar_emoji: partnerRole,
          phone: data.partner_phone || undefined,
        });
      }

      // Build conversation messages for persistence
      const conversationForApi = conversationMsgs.map(m => ({
        role: m.sender_type === 'nanny' ? 'assistant' : 'user',
        content: m.content,
      }));

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyName,
          parents: parentsToCreate,
          children: childrenWithDates,
          authUserId: onboardingAuthUserId,
          conversationMessages: conversationForApi,
          timezone: detectBrowserTimezone(),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Error al guardar');
      }

      // If partner phone exists, send WhatsApp invite
      if (data.partner_phone && data.partner_name) {
        const inviteUrl = `${window.location.origin}/login?invite=${result.family_id}`;
        const waMessage = encodeURIComponent(
          `¡Hola ${data.partner_name}! ${parentName} te invita a Nanny, una app para coordinar las cosas de los niños. Únete aquí: ${inviteUrl}`
        );
        const waPhone = data.partner_phone.replace(/[^0-9+]/g, '').replace(/^\+/, '');
        window.open(`https://wa.me/${waPhone}?text=${waMessage}`, '_blank');
      }

      // Seamless transition — reload data without page reload
      setOnboardingMode(false);
      onboardingInitiated.current = false;
      await loadData();
    } catch (err) {
      console.error('Save error:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), family_id: '', sender_id: null, sender_type: 'nanny',
        content: 'Hubo un error al crear tu familia. ¿Puedes intentar de nuevo?',
        message_type: 'text', metadata: { intent: 'CHAT', onboarding: true },
        created_at: new Date().toISOString(),
      }]);
      setOnboardingSaving(false);
    }
  };

  // Poll for new messages every 3 seconds (messages from other parent or other sessions).
  // - Usa una ref para que el intervalo siempre vea el último estado de mensajes
  //   sin re-crearse en cada cambio (antes recreaba el setInterval con cada msg
  //   nuevo, lo que reseteaba el reloj y causaba lag percibido).
  // - Dispara una pasada INMEDIATA en mount, sin esperar 3s. Esto cubre el caso
  //   donde la familia abre el chat justo después de recibir mensajes nuevos
  //   y antes los veía como una "segunda carga" 3 segundos después.
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!familyId) return;
    const checkNew = async () => {
      try {
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        if (!lastMsg) return;
        const newMsgs = await getNewMessages(lastMsg.created_at);
        if (newMsgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const truly_new = newMsgs.filter(m => !existingIds.has(m.id));
            return truly_new.length > 0 ? [...prev, ...truly_new] : prev;
          });
        }
      } catch {
        // Silently ignore polling errors
      }
    };
    checkNew(); // pasada inmediata
    // Polling como red de seguridad por si el WebSocket de realtime falla.
    // Antes era 3s; con realtime activo bajamos a 30s para reducir batería
    // sin perder cobertura cuando hay desconexiones del WS.
    const interval = setInterval(checkNew, 30000);
    return () => clearInterval(interval);
  }, [familyId]);

  // Real-time: cuando llega un mensaje nuevo a la tabla messages (de Nanny
  // proactiva, del otro padre, etc.), traerlo al state inmediatamente sin
  // esperar al próximo poll. Reusa la lógica del polling (getNewMessages
  // desde el último timestamp) — el debounce 200ms del hook agrupa varios
  // INSERT consecutivos en un solo fetch.
  useRealtimeFamily({
    familyId,
    tables: ['messages'],
    enabled: !!familyId,
    onChange: async () => {
      try {
        const lastMsg = messagesRef.current[messagesRef.current.length - 1];
        const newMsgs = lastMsg
          ? await getNewMessages(lastMsg.created_at)
          : await getMessages();
        if (newMsgs.length > 0) {
          setMessages(prev => {
            const seen = new Set(prev.map(m => m.id));
            const truly_new = newMsgs.filter(m => !seen.has(m.id));
            return truly_new.length > 0 ? [...prev, ...truly_new] : prev;
          });
        }
      } catch {
        // ignore — el polling lo cubrirá en 30s
      }
    },
  });

  // Persistir messages en localStorage cuando cambian. Usamos debounce
  // implícito vía effect (React batches updates). Si la pestaña se cierra
  // entre escritura y persist, perdemos lo último — recovery vía fetch
  // del server al volver.
  useEffect(() => {
    if (!familyId || messages.length === 0) return;
    saveCachedChat(familyId, messages);
  }, [familyId, messages]);

  // Push notification registration
  useEffect(() => {
    if (!familyId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    if (Notification.permission === 'granted') {
      registerPushNotifications().then((ok) => setPushStatus(ok ? 'granted' : 'denied'));
    } else if (Notification.permission === 'default') {
      setPushStatus('prompt');
    } else {
      setPushStatus('denied');
    }
  }, [familyId]);

  const currentParentObj = parents.find(p => p.id === currentParent);
  const otherParent = parents.find(p => p.id !== currentParent);

  // Toast helper — auto-dismiss after 4s
  const showToast = (text: string, href: string) => {
    setToast({ text, href });
    setTimeout(() => setToast(null), 4000);
  };

  // Normaliza un valor de assigned_to recibido del LLM al UUID del padre
  // correspondiente. La columna `tasks.assigned_to` es UUID FK a `parents.id`,
  // pero el extractor emite roles como strings ("mama", "papa"). Sin esta
  // traducción, el insert falla con "invalid input syntax for type uuid".
  // Casos manejados:
  //  - "mama" / "mamá" → parents.find(role='mama').id
  //  - "papa" / "papá" → parents.find(role='papa').id
  //  - UUID directo (ya viene resuelto) → pasa tal cual
  //  - "mama|papa", "ambos", null, "" → null (ambiguo / sin asignar)
  const roleToParentId = useCallback((value: unknown): string | null => {
    if (value == null) return null;
    const str = String(value).toLowerCase().trim();
    if (!str) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) {
      return String(value); // ya es UUID
    }
    if (str === 'mama' || str === 'mamá' || str === 'mami' || str === 'madre') {
      return parents.find(p => p.role === 'mama')?.id || null;
    }
    if (str === 'papa' || str === 'papá' || str === 'papi' || str === 'padre') {
      return parents.find(p => p.role === 'papa')?.id || null;
    }
    // Fallback: el LLM puede emitir el nombre propio en vez del rol
    const byName = parents.find(p => p.name.toLowerCase() === str);
    if (byName) return byName.id;
    // "mama|papa", "ambos", "los dos", "both", o cualquier otra cosa → null
    return null;
  }, [parents]);

  // Process Nanny AI response via SSE.
  //
  // Flujo:
  //  1. Cliente arranca el fetch SSE — nada visible aún en el chat.
  //  2. SSE emite `will_respond=true` (~500ms): prendemos los 3 puntos.
  //     Si emite `false`: nunca aparecen puntos, no hay mensaje en chat.
  //  3. SSE emite `response`: procesamos confirmations / agregamos mensaje
  //     de Nanny si hay reply / apagamos los puntos.
  const processNannyResponse = useCallback(async (text: string, parentMsg: Message) => {
    const recentMsgs = [...messages.slice(-25), parentMsg]
      .map(m => {
        const sender = m.sender_type === 'nanny' ? 'Nanny'
          : parents.find(p => p.id === m.sender_id)?.name || 'Padre';
        return `${sender}: ${m.content}`;
      }).join('\n');

    const familyCtx = `Familia: ${children.map(c => `${c.name} (${c.emoji}, ${c.birth_date ? formatAge(c.birth_date) : 'edad desconocida'}${c.school ? `, va a ${c.school}` : ''})`).join(', ')}. Padres: ${parents.map(p => `${p.name} (${p.avatar_emoji})`).join(' y ')}.`;

    const existingEventsStr = events.slice(-20).map(e =>
      `- ${e.title} (${e.event_type}, ${new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}${e.location ? `, ${e.location}` : ''})`
    ).join('\n');
    const existingTasksStr = tasks.filter(t => t.status !== 'done').slice(-15).map(t =>
      `- ${t.title} (${t.priority}${t.due_date ? `, vence ${new Date(t.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''}${t.assigned_to ? `, encargado: ${t.assigned_to}` : ''})`
    ).join('\n');
    const activeMeds = medications.filter(m => m.status === 'active').map(m =>
      `- ${m.medication_name} para ${m.child_name} (${m.frequency || ''}, horarios: ${m.schedule_times?.join(', ') || 'N/A'}, ${m.start_date} al ${m.end_date || '?'})`
    ).join('\n');
    // Rutinas activas con id literal para que el extractor pueda referenciarlas
    // como routine_id en confirmaciones de tipo routine_exception.
    const dayShort = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const existingRoutinesStr = routines.filter(r => r.active).map(r => {
      const child = children.find(c => c.id === r.child_id);
      const days = r.days_of_week.map(d => dayShort[d]).join(',');
      const time = r.time_start && r.time_end ? `${r.time_start.slice(0,5)}-${r.time_end.slice(0,5)}`
        : r.time_start ? r.time_start.slice(0,5) : '';
      return `- ${r.id}: ${child?.name || ''} · ${r.name} · ${days}${time ? ' ' + time : ''}`;
    }).join('\n');

    try {
      await callChatStream(
        {
          message: text,
          familyContext: familyCtx,
          recentMessages: recentMsgs,
          existingEvents: existingEventsStr,
          existingTasks: existingTasksStr,
          activeMedications: activeMeds || 'Ninguno',
          existingRoutines: existingRoutinesStr || 'Ninguna',
          childrenNames: children.map(c => c.name),
          senderName: currentParentObj?.name || 'Padre',
          senderRole: currentParentObj?.role || 'mama',
          pendingDetection,
          familyId,
        },
        {
          onWillRespond: (will) => {
            // 3-puntos solo si Nanny realmente va a escribir algo.
            if (will) setNannyThinking(true);
          },
          onResponse: async (rawData) => {
            const data = validateNannyResponse(rawData as unknown as Record<string, unknown>, events, tasks, medications);
            if (data.validation_warnings.length > 0) {
              console.log('[Validation warnings]:', data.validation_warnings);
            }

            // Helper para mapear el nombre de hijo (que puede venir en
            // varios campos del extractor) a su id en la base de datos.
            // Antes de este fix, los eventos y tareas se creaban con
            // child_id: null hardcoded, lo que perdía el contexto del hijo
            // aunque el AI lo hubiera detectado correctamente.
            const matchChildId = (...candidates: (string | undefined | null)[]): string | null => {
              for (const candidate of candidates) {
                if (!candidate) continue;
                const lower = String(candidate).toLowerCase().trim();
                if (!lower) continue;
                const match = children.find(c => c.name.toLowerCase().trim() === lower);
                if (match) return match.id;
              }
              return null;
            };

            // Si el extractor agrupa varias tareas bajo un topic paraguas (ej.
            // "Cumpleaños Pau"), creamos primero la tarea padre (o reutilizamos
            // una con el mismo título si ya existe). Las hijas se crean con
            // parent_task_id apuntando al padre.
            const taskGroup = (data as unknown as { task_group?: { parent_title: string; child_name: string | null } | null }).task_group;
            let parentTaskId: string | null = null;
            if (taskGroup?.parent_title) {
              try {
                const existingParent = tasks.find(t =>
                  t.parent_task_id === null &&
                  t.title.toLowerCase().trim() === taskGroup.parent_title.toLowerCase().trim()
                );
                if (existingParent) {
                  parentTaskId = existingParent.id;
                } else {
                  const parentTask = await addTask({
                    family_id: familyId,
                    child_id: matchChildId(taskGroup.child_name, data.child),
                    parent_task_id: null,
                    title: taskGroup.parent_title, description: null,
                    assigned_to: null, due_date: null,
                    status: 'pending', priority: 'normal', source: 'chat',
                    auto_detected: true, created_by: currentParent, completed_at: null,
                  });
                  setTasks(prev => [...prev, parentTask]);
                  parentTaskId = parentTask.id;
                }
              } catch {
                console.error('Failed to create/lookup parent task');
              }
            }

            // Helper para crear una tarea hija respetando status pending/done
            // y asociándola al parent si task_group está activo.
            const createTaskFromConf = async (confData: Record<string, unknown>) => {
              const explicitStatus = String((confData.status as string) || 'pending').toLowerCase();
              const status: 'pending' | 'done' = explicitStatus === 'done' ? 'done' : 'pending';
              const completedAt = status === 'done'
                ? (confData.completed_at as string) || new Date().toISOString()
                : null;
              const newTask = await addTask({
                family_id: familyId,
                child_id: matchChildId(confData.child as string, confData.child_name as string, data.child, taskGroup?.child_name),
                parent_task_id: parentTaskId,
                title: confData.title as string, description: null,
                assigned_to: roleToParentId(confData.assigned_to),
                due_date: (confData.due_date as string) || null,
                status, priority: 'normal', source: 'chat',
                auto_detected: true, created_by: currentParent,
                completed_at: completedAt,
              });
              setTasks(prev => [...prev, newTask]);
              return newTask;
            };

            if (data.confirmation) {
              const { type, data: confData } = data.confirmation;
              try {
                if (type === 'medication') {
                  const medMsgId = crypto.randomUUID();
                  setPendingMedConfirm({ messageId: medMsgId, data: confData, childName: data.child || '' });
                  (data as unknown as Record<string, unknown>)._medMsgId = medMsgId;
                } else if (type === 'event') {
                  const newEvent = await addEvent({
                    family_id: familyId,
                    child_id: matchChildId(confData.child as string, confData.child_name as string, data.child),
                    title: confData.title as string,
                    description: (confData.date_description as string) || null,
                    event_type: (confData.event_type as string) || 'other',
                    date_start: confData.date_start as string, date_end: null,
                    location: (confData.location as string) || null,
                    status: 'pending', source: 'chat', auto_detected: true, created_by: currentParent,
                  });
                  setEvents(prev => [...prev, newEvent]);
                  (data as unknown as Record<string, unknown>)._createdEventId = newEvent.id;
                  showToast(`Evento creado: ${confData.title}`, `/evento/${newEvent.id}`);
                } else if (type === 'task') {
                  const newTask = await createTaskFromConf(confData);
                  (data as unknown as Record<string, unknown>)._createdTaskId = parentTaskId || newTask.id;
                  if (parentTaskId) {
                    showToast(`Tarea agregada a «${taskGroup!.parent_title}»`, `/tarea/${parentTaskId}`);
                  } else {
                    showToast(`Tarea creada: ${confData.title}`, `/tarea/${newTask.id}`);
                  }
                } else if (type === 'routine') {
                  const childName = String(confData.child_name || '').trim();
                  console.log('[routine] intentando crear', { childName, knownChildren: children.map(c => c.name), confData });
                  const childMatch = children.find(c => c.name.toLowerCase().trim() === childName.toLowerCase());
                  if (!childMatch) {
                    console.warn('[routine] child_name no matchea ningún hijo registrado', { childName, knownChildren: children.map(c => c.name) });
                    showToast(`No encontré a ${childName || 'ese hijo'} en la familia`, '/hijo');
                  } else {
                    const newRoutine = await addRoutine({
                      child_id: childMatch.id,
                      type: (confData.type as string) || 'custom',
                      name: (confData.name as string) || 'Rutina',
                      description: null,
                      days_of_week: Array.isArray(confData.days_of_week) ? confData.days_of_week as number[] : [],
                      time_start: (confData.time_start as string) || null,
                      time_end: (confData.time_end as string) || null,
                      active: true,
                    });
                    console.log('[routine] creada OK', newRoutine);
                    setRoutines(prev => [...prev, newRoutine]);
                    (data as unknown as Record<string, unknown>)._routineChildId = childMatch.id;
                    showToast(`Rutina agregada: ${newRoutine.name}`, `/hijo/${childMatch.id}`);
                  }
                } else if (type === 'routine_exception') {
                  const routineId = String(confData.routine_id || '');
                  const date = String(confData.date || '');
                  if (routineId && date) {
                    const newException = await addRoutineException({
                      routine_id: routineId,
                      date,
                      cancelled: confData.cancelled !== false,
                      time_start_override: (confData.time_start_override as string) || null,
                      time_end_override: (confData.time_end_override as string) || null,
                      reason: (confData.reason as string) || null,
                    });
                    setRoutineExceptions(prev => [...prev, newException]);
                    const routine = routines.find(r => r.id === routineId);
                    showToast(`${routine?.name || 'Rutina'}: día cancelado`, '/agenda');
                  }
                }
              } catch (err) {
                console.error('Failed to auto-create event/task/routine', err);
                const msg = err instanceof Error ? err.message : 'Error desconocido';
                showToast(`No pude guardar: ${msg}`, '/chat');
              }
            }

            if (data.additional_confirmations && Array.isArray(data.additional_confirmations)) {
              for (const extraConf of data.additional_confirmations) {
                try {
                  if (extraConf.type === 'task' && extraConf.data?.title) {
                    await createTaskFromConf(extraConf.data);
                  } else if (extraConf.type === 'event' && extraConf.data?.title) {
                    const newEvent = await addEvent({
                      family_id: familyId,
                      child_id: matchChildId(extraConf.data.child as string, extraConf.data.child_name as string, data.child),
                      title: extraConf.data.title as string,
                      description: (extraConf.data.date_description as string) || null,
                      event_type: (extraConf.data.event_type as string) || 'other',
                      date_start: extraConf.data.date_start as string, date_end: null,
                      location: (extraConf.data.location as string) || null,
                      status: 'pending', source: 'chat', auto_detected: true, created_by: currentParent,
                    });
                    setEvents(prev => [...prev, newEvent]);
                  }
                } catch {
                  console.error('Failed to create additional confirmation');
                }
              }
            }

            if (data.pending_detection && data.pending_detection.type) {
              if (data.pending_detection.type === 'task' && data.pending_detection.partial_data?.title) {
                try {
                  const pd = data.pending_detection.partial_data;
                  const newTask = await addTask({
                    family_id: familyId,
                    child_id: matchChildId(pd.child as string, pd.child_name as string, data.child),
                    parent_task_id: null,
                    title: pd.title as string, description: null,
                    assigned_to: roleToParentId(pd.assigned_to),
                    due_date: (pd.due_date as string) || null,
                    status: 'pending', priority: 'normal', source: 'chat',
                    auto_detected: true, created_by: currentParent, completed_at: null,
                  });
                  setTasks(prev => [...prev, newTask]);
                  showToast(`Tarea creada: ${pd.title}`, '/tareas');
                } catch {
                  console.error('Failed to auto-create task from pending_detection');
                }
              } else {
                setPendingDetection(data.pending_detection);
              }
            } else if (data.confirmation) {
              setPendingDetection(null);
            }

            if (data.should_respond !== false && data.reply) {
              const medMsgId = (data as unknown as Record<string, unknown>)._medMsgId as string | undefined;
              const createdEventId = (data as unknown as Record<string, unknown>)._createdEventId as string | undefined;
              const createdTaskId = (data as unknown as Record<string, unknown>)._createdTaskId as string | undefined;
              const routineChildId = (data as unknown as Record<string, unknown>)._routineChildId as string | undefined;
              const nannyMsg = await addMessage({
                family_id: familyId, sender_id: null, sender_type: 'nanny',
                content: data.reply, message_type: 'text',
                metadata: {
                  intent: data.intent, next_action: data.next_action,
                  child: data.child || undefined,
                  ...(medMsgId ? { medConfirmId: medMsgId } : {}),
                  ...(data.confirmation?.type === 'medication' ? { medicationData: data.confirmation.data } : {}),
                  ...((data as unknown as { is_proactive?: boolean }).is_proactive ? { proactive: true } : {}),
                  ...(createdEventId ? { eventId: createdEventId } : {}),
                  ...(createdTaskId ? { taskId: createdTaskId } : {}),
                  ...(routineChildId ? { routineChildId } : {}),
                },
              });
              if (medMsgId) {
                setPendingMedConfirm(prev => prev ? { ...prev, messageId: nannyMsg.id } : null);
              }
              setMessages(prev => [...prev, nannyMsg]);
              sendPushToFamily(familyId, '🤖 Nanny', data.reply);
            }

            setNannyThinking(false);
          },
          onError: async (code, message) => {
            console.error('[chat sse] error', code, message);
            // NO persistir errores como mensajes de Nanny — quedan en el
            // historial para siempre y muestran texto técnico crudo al
            // usuario. Mostramos toast efímero con copy amigable según code.
            const userMsg = errorCodeToFriendlyMessage(code, message);
            showToast(userMsg, '/chat');
            setNannyThinking(false);
          },
        },
      );
    } catch (err) {
      console.error('[chat sse] stream failed:', err);
      showToast('Sin conexión con Nanny. Intentalo de nuevo.', '/chat');
      setNannyThinking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, parents, children, events, tasks, medications, familyId, currentParent, currentParentObj, pendingDetection]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');

    // Add parent message immediately
    const replyMeta: Record<string, unknown> = {};
    if (replyingTo) {
      replyMeta.reply_to_id = replyingTo.id;
      replyMeta.reply_to_content = replyingTo.content.slice(0, 100);
      replyMeta.reply_to_sender = replyingTo.sender_type === 'nanny' ? 'Nanny' : (parents.find(p => p.id === replyingTo.sender_id)?.name || 'Tú');
      setReplyingTo(null);
    }
    const parentMsg = await addMessage({
      family_id: familyId,
      sender_id: currentParent,
      sender_type: 'parent',
      content: text,
      message_type: 'text',
      metadata: replyMeta,
    });
    setMessages(prev => [...prev, parentMsg]);

    sendPushToFamily(
      familyId,
      `${currentParentObj?.name || 'Padre'}`,
      text,
      currentParent
    );

    // Buffer: acumular mensajes del mismo sender por 8 segundos
    // Esto evita procesar cada mensaje por separado cuando el padre envía varios seguidos
    // (ej: "separar local" + "invitar amiguitos" + "comprar mono" → una sola respuesta)
    // Durante el buffer NO mostramos ningún indicador — el silencio mantiene
    // la ilusión de asistente. Los 3 puntos solo aparecen después, cuando el
    // SSE confirma will_respond=true.
    bufferedTextsRef.current.push(text);
    lastParentMsgRef.current = parentMsg;

    if (bufferTimerRef.current) {
      clearTimeout(bufferTimerRef.current);
    }

    bufferTimerRef.current = setTimeout(() => {
      const combinedText = bufferedTextsRef.current.join('\n');
      const lastMsg = lastParentMsgRef.current;
      bufferedTextsRef.current = [];
      lastParentMsgRef.current = null;
      bufferTimerRef.current = null;

      if (lastMsg) {
        processNannyResponse(combinedText, lastMsg);
      }
    }, 8000);
  };

  const handleMedicationConfirm = async (action: 'confirm' | 'reject') => {
    if (!pendingMedConfirm) return;
    const { data: medData, childName } = pendingMedConfirm;

    if (action === 'confirm') {
      try {
        // Find the child ID
        const matchedChild = children.find(c => c.name.toLowerCase() === childName.toLowerCase());

        const newMed = await addMedication({
          family_id: familyId,
          child_id: matchedChild?.id || null,
          child_name: childName || (medData.medication_name as string) || 'Hijo',
          medication_name: (medData.medication_name as string) || 'Medicamento',
          duration_days: (medData.duration_days as number) || null,
          start_date: (medData.start_date as string) || new Date().toISOString(),
          end_date: (medData.end_date as string) || null,
          frequency: (medData.frequency as string) || null,
          schedule_times: (medData.schedule_times as string[]) || [],
          status: 'active',
          source: 'chat',
          auto_detected: true,
          created_by: currentParent,
        });
        setMedications(prev => [...prev, newMed]);

        // Create reminder events for each schedule time for the duration
        const scheduleTimes = (medData.schedule_times as string[]) || [];
        const durationDays = (medData.duration_days as number) || 1;
        const startDate = new Date((medData.start_date as string) || new Date().toISOString());
        const medName = (medData.medication_name as string) || 'Medicamento';

        for (let day = 0; day < durationDays; day++) {
          for (const time of scheduleTimes) {
            const [hours, minutes] = time.split(':').map(Number);
            const doseDate = new Date(startDate);
            doseDate.setDate(doseDate.getDate() + day);
            doseDate.setHours(hours, minutes, 0, 0);

            // Don't create reminders in the past
            if (doseDate <= new Date()) continue;

            // Reminder 10 minutes before the dose
            const reminderDate = new Date(doseDate.getTime() - 10 * 60 * 1000);

            await addEvent({
              family_id: familyId,
              child_id: matchedChild?.id || null,
              title: `${medName} - ${childName} en 10 min`,
              description: `Toma de ${time} — ${medData.frequency || ''}`,
              event_type: 'doctor',
              date_start: reminderDate.toISOString(),
              date_end: null,
              location: null,
              status: 'confirmed',
              source: 'chat',
              auto_detected: true,
              created_by: currentParent,
            });
          }
        }

        // Send confirmation message
        const confirmMsg = await addMessage({
          family_id: familyId,
          sender_id: null,
          sender_type: 'nanny',
          content: `Listo! Creé el tratamiento de ${medName} para ${childName}. Les avisaré 10 minutos antes de cada toma.`,
          message_type: 'text',
          metadata: { intent: 'MEDICATION', child: childName },
        });
        setMessages(prev => [...prev, confirmMsg]);
        sendPushToFamily(familyId, 'Nanny', `Recordatorios de ${medName} para ${childName} activados. Les avisaré 10 min antes de cada toma.`);
      } catch {
        console.error('Failed to create medication');
      }
    } else {
      const declineMsg = await addMessage({
        family_id: familyId,
        sender_id: null,
        sender_type: 'nanny',
        content: 'Entendido, no crearé recordatorios. Si cambian de opinión, me avisan 👍',
        message_type: 'text',
        metadata: { intent: 'CHAT' },
      });
      setMessages(prev => [...prev, declineMsg]);
    }
    setPendingMedConfirm(null);
  };

  // Si se llega con ?catchup=1 (desde /perfil → "Avanzado → Re-analizar"),
  // ejecutar runCatchup automáticamente y limpiar el query param.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('catchup') === '1' && messages.length > 0 && !catchingUp) {
      window.history.replaceState({}, '', '/chat');
      runCatchup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const runCatchup = async () => {
    if (catchingUp || messages.length === 0) return;
    setCatchingUp(true);

    // Show "analyzing" message
    const analyzingMsg: Message = {
      id: crypto.randomUUID(),
      family_id: familyId,
      sender_id: null,
      sender_type: 'nanny',
      content: 'Revisando todo el historial del chat para encontrar información que me haya faltado...',
      message_type: 'text',
      metadata: { intent: 'INFO' },
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, analyzingMsg]);

    try {
      // Build full message history with timestamps
      const allMsgs = messages
        .map(m => {
          const sender = m.sender_type === 'nanny' ? 'Nanny'
            : parents.find(p => p.id === m.sender_id)?.name || 'Padre';
          const time = new Date(m.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          return `[${time}] ${sender}: ${m.content}`;
        }).join('\n');

      const familyCtx = `Familia: ${children.map(c => `${c.name} (${c.emoji}, ${c.birth_date ? formatAge(c.birth_date) : 'edad desconocida'}${c.school ? `, va a ${c.school}` : ''})`).join(', ')}. Padres: ${parents.map(p => `${p.name} (${p.avatar_emoji})`).join(' y ')}.`;

      const existingEvts = events.slice(-20).map(e =>
        `- ${e.title} (${e.event_type}, ${new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })})`
      ).join('\n');
      const existingTsks = tasks.filter(t => t.status !== 'done').map(t =>
        `- ${t.title} (${t.priority})`
      ).join('\n');
      const activeMeds = medications.filter(m => m.status === 'active').map(m =>
        `- ${m.medication_name} para ${m.child_name} (${m.frequency || ''}, ${m.start_date} al ${m.end_date || '?'})`
      ).join('\n');

      const res = await fetch('/api/chat-catchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allMessages: allMsgs,
          familyContext: familyCtx,
          existingEvents: existingEvts || 'Ninguno',
          existingTasks: existingTsks || 'Ninguna',
          activeMedications: activeMeds || 'Ninguno',
        }),
      });

      const data = await res.json();

      // Remove the "analyzing" placeholder
      setMessages(prev => prev.filter(m => m.id !== analyzingMsg.id));

      if (data.error) {
        const errMsg = await addMessage({
          family_id: familyId, sender_id: null, sender_type: 'nanny',
          content: `Error:${data.error}`, message_type: 'text', metadata: {},
        });
        setMessages(prev => [...prev, errMsg]);
      } else {
        // Process found items
        const items = Array.isArray(data.found_items) ? data.found_items : [];
        console.log('[Catchup] Found items:', items.length, JSON.stringify(items));
        let createdCount = 0;
        let medFound = false;

        // Pre-pass: para cada task_group único, asegurar que existe la tarea
        // padre (reutilizamos si ya existe, sino la creamos). El mapa nos
        // permite linkear cada hija con parent_task_id sin re-buscar.
        type TaskGroup = { parent_title: string; child_name: string | null };
        const parentTaskCache = new Map<string, string>(); // lower(parent_title) → parent.id
        for (const item of items) {
          const tg = (item as { task_group?: TaskGroup | null }).task_group;
          if (item.type === 'task' && tg?.parent_title) {
            const key = tg.parent_title.toLowerCase().trim();
            if (parentTaskCache.has(key)) continue;
            const existingParent = tasks.find(t =>
              t.parent_task_id === null &&
              t.title.toLowerCase().trim() === key
            );
            if (existingParent) {
              parentTaskCache.set(key, existingParent.id);
            } else {
              const matchedChild = children.find(c => c.name.toLowerCase() === (tg.child_name || '').toLowerCase());
              const parentTask = await addTask({
                family_id: familyId, child_id: matchedChild?.id || null, parent_task_id: null,
                title: tg.parent_title, description: null,
                assigned_to: null, due_date: null,
                status: 'pending', priority: 'normal', source: 'chat',
                auto_detected: true, created_by: currentParent, completed_at: null,
              });
              setTasks(prev => [...prev, parentTask]);
              parentTaskCache.set(key, parentTask.id);
              console.log('[Catchup] Created parent task:', tg.parent_title);
            }
          }
        }

        for (const item of items) {
          console.log('[Catchup] Processing item:', item.type, item.summary);
          try {
            if (item.type === 'medication' && item.data) {
              medFound = true;
              // Store as pending confirmation — show in the reply message
              setPendingMedConfirm({
                messageId: crypto.randomUUID(),
                data: item.data,
                childName: item.child || '',
              });
              createdCount++;
            } else if (item.type === 'event' && item.data) {
              const dateStart = (item.data.date_start as string) || new Date().toISOString();
              const title = (item.data.title as string) || item.summary || 'Evento';
              const newDay = dateStart.split('T')[0];
              const isDuplicate = events.some(e =>
                e.title.toLowerCase() === title.toLowerCase() && e.date_start.split('T')[0] === newDay
              );
              if (!isDuplicate) {
                const matchedChild = children.find(c => c.name.toLowerCase() === (item.child || '').toLowerCase());
                const newEvent = await addEvent({
                  family_id: familyId,
                  child_id: matchedChild?.id || null,
                  title,
                  description: (item.data.date_description as string) || item.summary || null,
                  event_type: (item.data.event_type as string) || 'other',
                  date_start: dateStart, date_end: null,
                  location: (item.data.location as string) || null,
                  status: 'pending', source: 'chat', auto_detected: true, created_by: currentParent,
                });
                setEvents(prev => [...prev, newEvent]);
                createdCount++;
                console.log('[Catchup] Created event:', title);
              } else {
                console.log('[Catchup] Skipped duplicate event:', title);
              }
            } else if (item.type === 'task' && item.data) {
              const taskTitle = (item.data.title as string) || item.summary || 'Tarea';
              const tg = (item as { task_group?: TaskGroup | null }).task_group;
              const groupKey = tg?.parent_title ? tg.parent_title.toLowerCase().trim() : null;
              const parentTaskId = groupKey ? (parentTaskCache.get(groupKey) || null) : null;

              // Para deduplicación: si la tarea está en un grupo, dedupe solo
              // dentro de ese grupo (mismo parent_task_id). Si es suelta,
              // dedupe global por título.
              const isDupTask = parentTaskId
                ? tasks.some(t => t.parent_task_id === parentTaskId && t.title.toLowerCase() === taskTitle.toLowerCase())
                : tasks.some(t => t.title.toLowerCase() === taskTitle.toLowerCase() && t.status !== 'done' && t.parent_task_id === null);

              if (!isDupTask) {
                const matchedChild = children.find(c => c.name.toLowerCase() === (item.child || '').toLowerCase());
                const explicitStatus = String((item.data.status as string) || 'pending').toLowerCase();
                const status: 'pending' | 'done' = explicitStatus === 'done' ? 'done' : 'pending';
                const completedAt = status === 'done'
                  ? (item.data.completed_at as string) || new Date().toISOString()
                  : null;
                const newTask = await addTask({
                  family_id: familyId,
                  child_id: matchedChild?.id || null,
                  parent_task_id: parentTaskId,
                  title: taskTitle,
                  description: item.summary || null,
                  assigned_to: roleToParentId(item.data.assigned_to),
                  due_date: (item.data.due_date as string) || null,
                  status, priority: 'normal', source: 'chat',
                  auto_detected: true, created_by: currentParent,
                  completed_at: completedAt,
                });
                setTasks(prev => [...prev, newTask]);
                createdCount++;
                console.log('[Catchup] Created task:', taskTitle, parentTaskId ? `(grupo: ${tg!.parent_title})` : '');
              } else {
                console.log('[Catchup] Skipped duplicate task:', taskTitle);
              }
            }
          } catch (err) {
            console.error('[Catchup] Failed to create item:', item.type, item.summary, err);
          }
        }

        // Determine the intent for the reply badge
        const replyIntent = medFound ? 'MEDICATION' : createdCount > 0 ? 'INFO' : 'CHAT';

        // Build reply — append creation summary if items were created
        let replyText = data.reply || 'Revisé todo el chat y ya tengo toda la información capturada.';
        if (createdCount > 0 && !medFound) {
          replyText += `\n\nRegistré ${createdCount} item${createdCount > 1 ? 's' : ''} en el sistema.`;
        }

        // Post the summary reply
        const replyMsg = await addMessage({
          family_id: familyId, sender_id: null, sender_type: 'nanny',
          content: replyText,
          message_type: 'text',
          metadata: { intent: replyIntent, catchup: true },
        });
        setMessages(prev => [...prev, replyMsg]);
        sendPushToFamily(familyId, '🤖 Nanny', replyText);
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== analyzingMsg.id));
      const errMsg = await addMessage({
        family_id: familyId, sender_id: null, sender_type: 'nanny',
        content: 'Error:Ups, tuve un problema al revisar el historial. Intenta de nuevo.',
        message_type: 'text', metadata: {},
      });
      setMessages(prev => [...prev, errMsg]);
    }

    setCatchingUp(false);
  };

  const handleFeedback = async (messageId: string, useful: boolean) => {
    setFeedbackGiven(prev => ({ ...prev, [messageId]: useful ? 'up' : 'down' }));
    try {
      const res = await fetch('/api/family-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'intervention_feedback',
          operation: 'insert',
          data: {
            id: crypto.randomUUID(),
            message_id: messageId,
            parent_id: currentParent,
            useful,
            created_at: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) console.error('Failed to save feedback');
    } catch {
      console.error('Failed to save feedback');
    }
  };


  const renderIntentBadge = (intent: NannyIntent | undefined, hasPendingMed: boolean, metadata?: Record<string, unknown>) => {
    if (!intent) return null;

    const badgeConfig: Record<string, { icon: React.ReactNode; label: string; color: string; borderColor: string }> = {
      EVENT_SCHOOL: { icon: <CalendarDays size={16} />, label: 'Evento escolar', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      EVENT_ACTIVITY: { icon: <CalendarDays size={16} />, label: 'Actividad', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      EVENT_MEDICAL: { icon: <CalendarDays size={16} />, label: 'Cita médica', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      MILESTONE: { icon: <CalendarDays size={16} />, label: 'Fecha importante', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      TASK_SHOPPING: { icon: <ListChecks size={16} />, label: 'Tarea pendiente', color: 'text-blue-600', borderColor: 'border-blue-200' },
      TASK_PAYMENT: { icon: <CreditCard size={16} />, label: 'Pago pendiente', color: 'text-blue-600', borderColor: 'border-blue-200' },
      SUPPLY_LOW: { icon: <AlertTriangle size={16} />, label: 'Suministro bajo', color: 'text-orange-600', borderColor: 'border-orange-200' },
      MEDICATION: { icon: <Pill size={16} />, label: hasPendingMed ? '¿Crear recordatorios?' : 'Tratamiento registrado', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      LOGISTICS_PICKUP: { icon: <Car size={16} />, label: 'Recogida asignada', color: 'text-green-600', borderColor: 'border-green-200' },
      LOGISTICS_TRANSPORT: { icon: <Car size={16} />, label: 'Transporte', color: 'text-green-600', borderColor: 'border-green-200' },
      SCHEDULE_CHANGE: { icon: <Clock size={16} />, label: 'Cambio de horario', color: 'text-amber-600', borderColor: 'border-amber-200' },
      HEALTH_LOG: { icon: <Thermometer size={16} />, label: 'Síntoma registrado', color: 'text-amber-600', borderColor: 'border-amber-200' },
      ROUTINE: { icon: <Repeat size={16} />, label: 'Rutina creada', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      // Legacy intents (backward compatibility)
      EVENT: { icon: <CalendarDays size={16} />, label: 'Evento registrado', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      TASK: { icon: <CheckSquare size={16} />, label: 'Tarea registrada', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
    };

    const config = badgeConfig[intent];
    if (!config) return null;

    // Skip the standalone badge for MEDICATION when pending confirm is active (buttons shown separately)
    if (intent === 'MEDICATION' && hasPendingMed) return null;

    // Si la metadata trae el ID del item creado, navegamos directo al detalle.
    // Si no, caemos al listado correspondiente — agenda para eventos, tareas
    // para tareas, perfil del hijo para health logs.
    const eventId = metadata?.eventId as string | undefined;
    const taskId = metadata?.taskId as string | undefined;

    const intentFallback: Record<string, string | null> = {
      EVENT_SCHOOL: '/agenda', EVENT_ACTIVITY: '/agenda', EVENT_MEDICAL: '/agenda', MILESTONE: '/agenda',
      TASK_SHOPPING: '/tareas', TASK_PAYMENT: '/tareas', SUPPLY_LOW: '/tareas',
      MEDICATION: '/agenda',
      LOGISTICS_PICKUP: '/agenda', LOGISTICS_TRANSPORT: '/agenda',
      SCHEDULE_CHANGE: '/agenda', HEALTH_LOG: '/hijo',
      ROUTINE: '/hijo',
      EVENT: '/agenda', TASK: '/tareas',
    };

    const routineChildId = metadata?.routineChildId as string | undefined;

    let navTarget: string | null = null;
    const isEventIntent = intent.startsWith('EVENT') || intent === 'MILESTONE' || intent === 'LOGISTICS_PICKUP' || intent === 'LOGISTICS_TRANSPORT' || intent === 'SCHEDULE_CHANGE';
    const isTaskIntent = intent.startsWith('TASK') || intent === 'SUPPLY_LOW';
    if (intent === 'ROUTINE' && routineChildId) navTarget = `/hijo/${routineChildId}`;
    else if (isEventIntent && eventId) navTarget = `/evento/${eventId}`;
    else if (isTaskIntent && taskId) navTarget = `/tarea/${taskId}`;
    else navTarget = intentFallback[intent] ?? null;

    const navCopy: Record<string, string> = {
      EVENT_SCHOOL: 'Ver evento',
      EVENT_ACTIVITY: 'Ver evento',
      EVENT_MEDICAL: 'Ver evento',
      MILESTONE: 'Ver evento',
      TASK_SHOPPING: 'Ver tarea',
      TASK_PAYMENT: 'Ver tarea',
      SUPPLY_LOW: 'Ver tarea',
      MEDICATION: 'Ver agenda',
      LOGISTICS_PICKUP: 'Ver agenda',
      LOGISTICS_TRANSPORT: 'Ver agenda',
      SCHEDULE_CHANGE: 'Ver agenda',
      HEALTH_LOG: 'Ver perfil',
      ROUTINE: 'Ver rutinas',
      EVENT: 'Ver evento',
      TASK: 'Ver tarea',
    };

    return (
      <button
        onClick={() => navTarget && router.push(navTarget)}
        className={`mt-2 -mx-1 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/70 hover:bg-white transition-colors w-full text-left shadow-xs border border-[var(--border-subtle)]`}
      >
        <span className={`size-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--nanny-purple-tint)]`}>
          <span className={config.color}>{config.icon}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-footnote font-semibold text-[var(--text-primary)] leading-tight">{config.label}</p>
          {navTarget && (
            <p className="text-caption text-[var(--text-tertiary)] leading-tight mt-0.5">{navCopy[intent] || 'Ver detalles'} →</p>
          )}
        </div>
        {navTarget && <ChevronRight size={14} className="text-[var(--text-quaternary)] shrink-0" />}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-[var(--nanny-bg)] page-enter"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        maxWidth: 430,
        margin: '0 auto',
        overflow: 'hidden',
      }}
    >
      {/* Header — glass Apple-style */}
      <div className="glass px-4 py-3 shrink-0 z-[var(--z-sticky)]">
        <PageHeader
          title="Chat"
          subtitle={onboardingMode
            ? (onboardingSaving ? 'Creando tu familia…' : 'Configuremos tu familia')
            : ['Nanny', ...parents.map(p => p.name)].join(' · ')}
        />
      </div>

      {/* Search bar (expandible) — DEPRECATED: se eliminó el botón. El bloque queda
          condicional a showSearch que ya nunca se setea, por lo que es no-op.
          Lo dejo unos commits hasta limpiar definitivamente para no romper nada
          relacionado en este pase. */}
      {showSearch && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--separator)] bg-[var(--bg-elevated)] animate-slide-up">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar en el chat…"
              autoFocus
              aria-label="Buscar en el chat"
              className="pl-10 pr-10 py-2 text-subhead"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full bg-[var(--gray-200)] flex items-center justify-center text-[var(--text-secondary)]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Push notification prompt */}
      {pushStatus === 'prompt' && (
        <div className="mx-3 mt-2 flex items-center gap-3 bg-[var(--nanny-purple-tint)] rounded-xl px-4 py-3 border border-[var(--nanny-purple-soft)] animate-slide-up">
          <Bell size={20} className="text-[var(--nanny-purple)] shrink-0" />
          <p className="text-footnote text-[var(--text-primary)] flex-1 text-pretty">
            Activa las notificaciones para no perderte mensajes
          </p>
          <button
            onClick={async () => {
              const ok = await registerPushNotifications();
              setPushStatus(ok ? 'granted' : 'denied');
            }}
            className="btn btn-primary btn-sm shrink-0"
          >
            Activar
          </button>
          <button onClick={() => setPushStatus('denied')} aria-label="Descartar" className="size-7 rounded-full hover:bg-white/40 flex items-center justify-center text-[var(--text-secondary)] shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toast de confirmación */}
      {toast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[var(--z-toast)] animate-slide-up"
          style={{ maxWidth: '400px', width: '90%' }}
        >
          <button
            onClick={() => { setToast(null); router.push(toast.href); }}
            className="w-full flex items-center gap-2 glass-dark rounded-2xl px-4 py-3 shadow-lg"
          >
            <CheckSquare size={16} className="text-[var(--success)]" />
            <span className="text-subhead text-white flex-1 text-left">{toast.text}</span>
            <span className="text-caption text-white/80">Ver →</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">
        {/* Empty state con sugerencias tappables */}
        {messages.length === 0 && !nannyThinking && dataLoaded && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <div className="size-16 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-4">
              <Bot size={32} className="text-[var(--nanny-purple)]" />
            </div>
            <p className="text-sm text-[var(--nanny-gray)] mb-1 text-center text-pretty">Escr&iacute;bele a Nanny como le hablar&iacute;as a tu pareja</p>
            <p className="text-xs text-[var(--nanny-gray)] mb-6 opacity-60">Prueba con alguna de estas:</p>
            <div className="space-y-2 w-full max-w-[300px]">
              {[
                children.length > 0
                  ? `${children[0].name} tiene dentista mañana a las 4`
                  : 'Lucas tiene dentista mañana a las 4',
                'Hay que comprar pañales y leche',
                children.length > 0
                  ? `El doctor le recetó ibuprofeno a ${children[0].name} por 5 días`
                  : 'El doctor le recetó ibuprofeno por 5 días',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); focusWithoutScroll(); }}
                  className="w-full text-left px-4 py-3 bg-[var(--nanny-gray-light)] rounded-xl text-sm text-[var(--nanny-gray)] hover:bg-[var(--nanny-purple-bg)] hover:text-[var(--nanny-purple)] transition-colors"
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const displayedMessages = searchQuery.trim()
            ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
            : messages;
          return displayedMessages.length === 0 && searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
              <div className="size-12 rounded-2xl bg-[var(--gray-100)] flex items-center justify-center mb-3">
                <Search size={20} className="text-[var(--text-tertiary)]" />
              </div>
              <p className="text-subhead text-[var(--text-primary)]">Sin resultados</p>
              <p className="text-footnote text-[var(--text-tertiary)] mt-1 text-pretty">No encontramos mensajes con &ldquo;{searchQuery}&rdquo;</p>
            </div>
          ) : null;
        })()}
        {(searchQuery.trim()
          ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
          : messages
        ).map((msg, idx, arr) => {
          const isNanny = msg.sender_type === 'nanny';
          const isCurrentParent = onboardingMode
            ? msg.sender_type === 'parent'
            : msg.sender_id === currentParent;
          const senderParent = parents.find(p => p.id === msg.sender_id);
          const isOtherParent = !isNanny && !isCurrentParent;

          // Date separator — show if first message or different day from previous
          const msgDate = new Date(msg.created_at).toDateString();
          const prevDate = idx > 0 ? new Date(arr[idx - 1].created_at).toDateString() : null;
          const showDateSep = !onboardingMode && (idx === 0 || msgDate !== prevDate);
          const today = new Date().toDateString();
          const yesterday = new Date(Date.now() - 86400000).toDateString();
          const dateLabel = msgDate === today ? 'Hoy'
            : msgDate === yesterday ? 'Ayer'
            : new Date(msg.created_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

          // Reply reference
          const replyToId = msg.metadata?.reply_to_id as string | undefined;
          const replyToContent = msg.metadata?.reply_to_content as string | undefined;
          const replyToSender = msg.metadata?.reply_to_sender as string | undefined;

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] text-[var(--nanny-gray)] font-medium uppercase">{dateLabel}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              <SwipeableMessage onSwipe={() => { setReplyingTo(msg); focusWithoutScroll(); }}>
              <div className={`flex ${isCurrentParent ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              {/* Avatar circle for other parent */}
              {isOtherParent && (
                <div className="size-9 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-5 shrink-0">
                  <UserIcon size={16} className="text-blue-500" />
                </div>
              )}
              <div className="max-w-[80%]">
                {/* Sender label */}
                <p className={`text-xs mb-1 ${isCurrentParent ? 'text-right mr-1' : 'ml-1'}`}>
                  {isNanny ? (
                    <span className="inline-flex items-center gap-1 text-[var(--nanny-purple)] font-medium"><Bot size={14} /> Nanny</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[var(--nanny-gray)]"><UserIcon size={14} /> {senderParent?.name || currentParentObj?.name || 'Tú'}</span>
                  )}
                </p>
                <div className={
                  isNanny ? 'bubble-nanny' :
                  isCurrentParent ? 'bubble-parent' : 'bubble-other-parent'
                }>
                  {/* Reply reference */}
                  {replyToId && replyToContent && (
                    <div className="mb-2 pl-2 border-l-2 border-[var(--nanny-purple-light)] rounded-sm">
                      <p className="text-[11px] font-medium text-[var(--nanny-purple)]">{replyToSender || 'Mensaje'}</p>
                      <p className="text-[12px] text-[var(--nanny-gray)] line-clamp-2">{replyToContent}</p>
                    </div>
                  )}
                  <p className="text-[16px] whitespace-pre-wrap">{msg.content}</p>
                  {/* Intent badges */}
                  {isNanny && renderIntentBadge(msg.metadata?.intent as NannyIntent, !!pendingMedConfirm, msg.metadata as Record<string, unknown> | undefined)}
                  {isNanny && msg.metadata?.intent === 'MEDICATION' && pendingMedConfirm && (
                    <div className="mt-3 pt-2 border-t border-[var(--nanny-purple-light)]">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pill size={16} className="text-[var(--nanny-purple)]" />
                        <span className="text-xs font-medium text-[var(--nanny-purple)]">¿Crear recordatorios?</span>
                      </div>
                      {editingMedTimes ? (
                        <>
                          <div className="space-y-2 mb-2">
                            {editingMedTimes.map((t, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={t}
                                  onChange={(e) => {
                                    const updated = [...editingMedTimes];
                                    updated[i] = e.target.value;
                                    setEditingMedTimes(updated);
                                  }}
                                  className="flex-1 input"
                                  aria-label={`Horario ${i + 1}`}
                                />
                                {editingMedTimes.length > 1 && (
                                  <button
                                    onClick={() => setEditingMedTimes(editingMedTimes.filter((_, j) => j !== i))}
                                    aria-label="Quitar horario"
                                    className="size-9 rounded-full hover:bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-tertiary)] focus-ring"
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => setEditingMedTimes([...editingMedTimes, '12:00'])}
                            className="text-xs text-[var(--nanny-purple)] font-medium focus-ring rounded mb-2"
                          >
                            + Agregar horario
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingMedTimes(null)}
                              className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)] text-xs font-semibold focus-ring"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => {
                                if (editingMedTimes && pendingMedConfirm) {
                                  setPendingMedConfirm({
                                    ...pendingMedConfirm,
                                    data: { ...pendingMedConfirm.data, schedule_times: editingMedTimes },
                                  });
                                  setEditingMedTimes(null);
                                }
                              }}
                              className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-purple)] text-white text-xs font-semibold focus-ring"
                            >
                              Guardar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {(() => {
                            const times = (pendingMedConfirm.data?.schedule_times as string[]) || [];
                            return times.length > 0 && (
                              <p className="text-[10px] text-[var(--nanny-gray)] mb-2 tabular-nums">
                                Horarios: {times.join(', ')}
                              </p>
                            );
                          })()}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleMedicationConfirm('confirm')}
                              className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-purple)] text-white text-xs font-semibold focus-ring"
                            >
                              Sí, crear
                            </button>
                            <button
                              onClick={() => {
                                const times = (pendingMedConfirm?.data?.schedule_times as string[]) || ['08:00'];
                                setEditingMedTimes([...times]);
                              }}
                              className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-purple-bg)] text-[var(--nanny-purple)] text-xs font-semibold focus-ring"
                            >
                              Editar horarios
                            </button>
                            <button
                              onClick={() => handleMedicationConfirm('reject')}
                              className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)] text-xs font-semibold focus-ring"
                            >
                              No
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {/* Feedback buttons for Nanny messages */}
                {isNanny && !onboardingMode && (
                  <div className="flex gap-2 mt-1 ml-1">
                    {feedbackGiven[msg.id] ? (
                      <span className="text-xs text-[var(--nanny-gray)] inline-flex items-center gap-1">
                        {feedbackGiven[msg.id] === 'up' ? <><ThumbsUp size={12} /> Gracias</> : <><ThumbsDown size={12} /> Anotado</>}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFeedback(msg.id, true)}
                          aria-label="Marcar respuesta como útil"
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, false)}
                          aria-label="Marcar respuesta como no útil"
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-red)] transition-colors"
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </>
                    )}
                    <span className="text-xs text-[var(--nanny-gray)] tabular-nums">
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {!isNanny && !onboardingMode && (
                  <p className={`text-xs text-[var(--nanny-gray)] mt-0.5 tabular-nums ${isCurrentParent ? 'text-right mr-1' : 'ml-1'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
            </SwipeableMessage>
            </div>
          );
        })}
        {/* Indicador "Nanny está escribiendo": SOLO 3 puntos, sin texto.
            Se prende vía SSE event `will_respond=true`, es decir cuando Nanny
            realmente va a publicar un mensaje. Si el classifier decide que no
            hay nada que decir, este bloque nunca aparece. */}
        {nannyThinking && (
          <div className="flex justify-start animate-fade-in">
            <div>
              <p className="text-xs mb-1 ml-1 inline-flex items-center gap-1 text-[var(--nanny-purple)] font-medium"><Bot size={14} /> Nanny</p>
              <div className="bubble-nanny inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="size-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="size-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer — slim estilo WhatsApp/Instagram */}
      <div className="shrink-0 glass-strong border-t border-[var(--separator)] px-3 py-1">
        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 px-1 animate-slide-up">
            <div className="flex-1 pl-3 border-l-2 border-[var(--nanny-purple)] rounded-sm min-w-0">
              <p className="text-caption text-[var(--nanny-purple)] font-semibold">
                {replyingTo.sender_type === 'nanny' ? 'Nanny' : (parents.find(p => p.id === replyingTo.sender_id)?.name || 'Tú')}
              </p>
              <p className="text-footnote text-[var(--text-secondary)] truncate">{replyingTo.content}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} aria-label="Cancelar respuesta" className="size-8 rounded-full hover:bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-tertiary)] focus-ring">
              <X size={16} />
            </button>
          </div>
        )}
        <form className="flex items-center gap-2" onSubmit={(e) => {
          e.preventDefault();
          onboardingMode ? sendOnboardingMessage() : sendMessage();
        }}>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onTouchEnd={handleInputTouchEnd}
            placeholder={onboardingMode && onboardingSaving ? 'Espera un momento…' : 'Mensaje'}
            disabled={onboardingMode && (onboardingSending || onboardingSaving)}
            aria-label="Mensaje"
            className="chat-input-field flex-1 bg-[var(--gray-100)] rounded-full px-4 py-1.5 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-[var(--nanny-purple-tint)] focus:border-[var(--nanny-purple)] disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            aria-label="Enviar mensaje"
            disabled={!input.trim() || (onboardingMode && (onboardingSending || onboardingSaving))}
            className="size-9 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center disabled:opacity-30 disabled:scale-90 enabled:active:scale-95 transition-all shrink-0 shadow-sm focus-ring"
          >
            <Send size={16} className="text-white ml-[1px]" />
          </button>
        </form>
      </div>

    </div>
  );
}

