'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot, CalendarDays, CheckSquare, Bell, X, Pill, RefreshCw, Thermometer, ListChecks, CreditCard, Car, Clock, AlertTriangle, ChevronRight, MoreVertical, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinIcon, User as UserIcon, Reply } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getMessages, getNewMessages, addMessage, addEvent, addTask, addMedication, getMedications, getParents, getChildren, getFamily, getEvents, getTasks, getCurrentParentId, hasFamily, getCachedFamilyId, getCachedSnapshot } from '@/lib/store';
import { registerPushNotifications, sendPushToFamily } from '@/lib/push';
import { validateNannyResponse } from '@/lib/validation';
import { getSupabase } from '@/lib/supabase';
import type { Message, Parent, Child, FamilyEvent, Task, Medication, NannyIntent } from '@/lib/types';

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
    // Only swipe left (negative dx)
    if (dx > 5) return;
    const absDx = Math.abs(dx);
    if (absDx > 10) swiping.current = true;
    if (!swiping.current) return;

    // Cap at -80px
    const offset = Math.max(-80, dx);
    currentX.current = offset;
    if (ref.current) {
      ref.current.style.transform = `translateX(${offset}px)`;
      ref.current.style.transition = 'none';
    }

    // Haptic feedback at threshold
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
    <div className="relative overflow-hidden">
      {/* Reply icon revealed behind the message */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--nanny-gray)] opacity-40">
        <Reply size={20} />
      </div>
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-[var(--nanny-gray-light)] will-change-transform"
        style={{ backgroundColor: 'transparent' }}
      >
        {kids}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  // Initialize from cache to avoid flash on revisit
  const _snap = getCachedSnapshot();
  const [messages, setMessages] = useState<Message[]>(_snap?.messages || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [familyId, setFamilyId] = useState<string>(_snap?.family?.id || '');
  const [input, setInput] = useState('');
  const [currentParent, setCurrentParent] = useState<string>(_snap?.currentParentId || '');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const [pushStatus, setPushStatus] = useState<'idle' | 'prompt' | 'granted' | 'denied'>('idle');
  const [toast, setToast] = useState<{ text: string; href: string } | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
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
  const [nannyWaiting, setNannyWaiting] = useState(false);
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
  const initialScrollDone = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Adjust container height when virtual keyboard opens/closes
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (containerRef.current) {
        const bottomNav = 64 + 20; // bottom nav height + gap
        const h = vv.height - bottomNav;
        containerRef.current.style.height = `${h}px`;
      }
    };
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
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
        const familyExists = await hasFamily();
        if (!familyExists) {
          setOnboardingMode(true);
          setDataLoaded(true);
          setOnboardingAuthUserId(user.id);
          setOnboardingAuthEmail(user.email || '');
          return;
        }
      }

      // Family exists — load all data (hits cache if fresh)
      const [fam, msgs, prts, chld, evts, tsks, meds] = await Promise.all([
        getFamily(), getMessages(), getParents(), getChildren(), getEvents(), getTasks(), getMedications(),
      ]);
      if (!fam) { window.location.href = '/login'; return; }
      setFamilyId(fam.id);
      setMessages(msgs);
      setParents(prts);
      setChildren(chld);
      setEvents(evts);
      setTasks(tsks);
      setMedications(meds);
      if (prts.length > 0 && !currentParent) {
        const myParentId = getCurrentParentId();
        const matchedParent = myParentId && prts.find(p => p.id === myParentId);
        setCurrentParent(matchedParent ? matchedParent.id : prts[0].id);
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
      // First render: scroll instantly (no animation) to avoid visible scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      if (messages.length > 0) initialScrollDone.current = true;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
    inputRef.current?.focus();
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

  // Poll for new messages every 3 seconds (messages from other parent or other sessions)
  useEffect(() => {
    if (!familyId) return;
    const interval = setInterval(async () => {
      try {
        const lastMsg = messages[messages.length - 1];
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
    }, 3000);
    return () => clearInterval(interval);
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

  // Process Nanny AI response in background (doesn't block input)
  const processNannyResponse = useCallback(async (text: string, parentMsg: Message) => {
    setNannyThinking(true);
    try {
      const recentMsgs = [...messages.slice(-15), parentMsg]
        .map(m => {
          const sender = m.sender_type === 'nanny' ? 'Nanny'
            : parents.find(p => p.id === m.sender_id)?.name || 'Padre';
          return `${sender}: ${m.content}`;
        }).join('\n');

      const familyCtx = `Familia: ${children.map(c => `${c.name} (${c.emoji}, ${c.birth_date ? calcAge(c.birth_date) : '?'} años${c.school ? `, va a ${c.school}` : ''})`).join(', ')}. Padres: ${parents.map(p => `${p.name} (${p.avatar_emoji})`).join(' y ')}.`;

      const existingEventsStr = events.slice(-10).map(e =>
        `- ${e.title} (${e.event_type}, ${new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}${e.location ? `, ${e.location}` : ''})`
      ).join('\n');
      const existingTasksStr = tasks.filter(t => t.status !== 'done').slice(-10).map(t =>
        `- ${t.title} (${t.priority}${t.due_date ? `, vence ${new Date(t.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''})`
      ).join('\n');
      const activeMeds = medications.filter(m => m.status === 'active').map(m =>
        `- ${m.medication_name} para ${m.child_name} (${m.frequency || ''}, horarios: ${m.schedule_times?.join(', ') || 'N/A'}, ${m.start_date} al ${m.end_date || '?'})`
      ).join('\n');

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          familyContext: familyCtx,
          recentMessages: recentMsgs,
          existingEvents: existingEventsStr,
          existingTasks: existingTasksStr,
          activeMedications: activeMeds || 'Ninguno',
          senderName: currentParentObj?.name || 'Padre',
          pendingDetection,
        }),
      });

      const rawData = await res.json();

      if (rawData.error) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          family_id: familyId,
          sender_id: null,
          sender_type: 'nanny',
          content: `Error:${rawData.error}`,
          message_type: 'text',
          metadata: {},
          created_at: new Date().toISOString(),
        }]);
      } else {
        const data = validateNannyResponse(rawData, events, tasks, medications);

        if (data.validation_warnings.length > 0) {
          console.log('[Validation warnings]:', data.validation_warnings);
        }

        if (data.confirmation) {
          const { type, data: confData } = data.confirmation;
          try {
            if (type === 'medication') {
              const medMsgId = crypto.randomUUID();
              setPendingMedConfirm({ messageId: medMsgId, data: confData, childName: data.child || '' });
              (data as unknown as Record<string, unknown>)._medMsgId = medMsgId;
            } else if (type === 'event') {
              const newEvent = await addEvent({
                family_id: familyId, child_id: null,
                title: confData.title as string,
                description: (confData.date_description as string) || null,
                event_type: (confData.event_type as string) || 'other',
                date_start: confData.date_start as string, date_end: null,
                location: (confData.location as string) || null,
                status: 'pending', source: 'chat', auto_detected: true, created_by: currentParent,
              });
              setEvents(prev => [...prev, newEvent]);
              showToast(`Evento creado: ${confData.title}`, '/hoy');
            } else if (type === 'task') {
              const newTask = await addTask({
                family_id: familyId, child_id: null,
                title: confData.title as string, description: null,
                assigned_to: (confData.assigned_to as string) || null,
                due_date: (confData.due_date as string) || null,
                status: 'pending', priority: 'normal', source: 'chat',
                auto_detected: true, created_by: currentParent, completed_at: null,
              });
              setTasks(prev => [...prev, newTask]);
              showToast(`Tarea creada: ${confData.title}`, '/hoy');
            }
          } catch {
            console.error('Failed to auto-create event/task');
          }
        }

        // Handle additional_confirmations for batch task/event creation
        if (data.additional_confirmations && Array.isArray(data.additional_confirmations)) {
          for (const extraConf of data.additional_confirmations) {
            try {
              if (extraConf.type === 'task' && extraConf.data?.title) {
                const newTask = await addTask({
                  family_id: familyId, child_id: null,
                  title: extraConf.data.title as string, description: null,
                  assigned_to: (extraConf.data.assigned_to as string) || null,
                  due_date: (extraConf.data.due_date as string) || null,
                  status: 'pending', priority: 'normal', source: 'chat',
                  auto_detected: true, created_by: currentParent, completed_at: null,
                });
                setTasks(prev => [...prev, newTask]);
              } else if (extraConf.type === 'event' && extraConf.data?.title) {
                const newEvent = await addEvent({
                  family_id: familyId, child_id: null,
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
          // Auto-create tasks from pending_detection — tasks don't need confirmation
          if (data.pending_detection.type === 'task' && data.pending_detection.partial_data?.title) {
            try {
              const pd = data.pending_detection.partial_data;
              const newTask = await addTask({
                family_id: familyId, child_id: null,
                title: pd.title as string, description: null,
                assigned_to: (pd.assigned_to as string) || null,
                due_date: (pd.due_date as string) || null,
                status: 'pending', priority: 'normal', source: 'chat',
                auto_detected: true, created_by: currentParent, completed_at: null,
              });
              setTasks(prev => [...prev, newTask]);
              showToast(`Tarea creada: ${pd.title}`, '/hoy');
            } catch {
              console.error('Failed to auto-create task from pending_detection');
            }
            // Don't keep task pending_detection — already created
          } else {
            setPendingDetection(data.pending_detection);
          }
        } else if (data.confirmation) {
          setPendingDetection(null);
        }

        if (data.should_respond !== false && data.reply) {
          const medMsgId = (data as unknown as Record<string, unknown>)._medMsgId as string | undefined;
          const nannyMsg = await addMessage({
            family_id: familyId, sender_id: null, sender_type: 'nanny',
            content: data.reply, message_type: 'text',
            metadata: {
              intent: data.intent, next_action: data.next_action,
              child: data.child || undefined,
              ...(medMsgId ? { medConfirmId: medMsgId } : {}),
              ...(data.confirmation?.type === 'medication' ? { medicationData: data.confirmation.data } : {}),
            },
          });
          if (medMsgId) {
            setPendingMedConfirm(prev => prev ? { ...prev, messageId: nannyMsg.id } : null);
          }
          setMessages(prev => [...prev, nannyMsg]);
          sendPushToFamily(familyId, '🤖 Nanny', data.reply);
        }
      }
    } catch {
      const errorMsg = await addMessage({
        family_id: familyId, sender_id: null, sender_type: 'nanny',
        content: 'Error:Ups, tuve un problema. Intenta de nuevo.',
        message_type: 'text', metadata: {},
      });
      setMessages(prev => [...prev, errorMsg]);
    }
    setNannyThinking(false);
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
    bufferedTextsRef.current.push(text);
    lastParentMsgRef.current = parentMsg;

    // Show "waiting" indicator while buffering
    setNannyWaiting(true);

    if (bufferTimerRef.current) {
      clearTimeout(bufferTimerRef.current);
    }

    bufferTimerRef.current = setTimeout(() => {
      const combinedText = bufferedTextsRef.current.join('\n');
      const lastMsg = lastParentMsgRef.current;
      bufferedTextsRef.current = [];
      lastParentMsgRef.current = null;
      bufferTimerRef.current = null;
      setNannyWaiting(false);

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

      const familyCtx = `Familia: ${children.map(c => `${c.name} (${c.emoji}, ${c.birth_date ? calcAge(c.birth_date) : '?'} años${c.school ? `, va a ${c.school}` : ''})`).join(', ')}. Padres: ${parents.map(p => `${p.name} (${p.avatar_emoji})`).join(' y ')}.`;

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
              const isDupTask = tasks.some(t => t.title.toLowerCase() === taskTitle.toLowerCase() && t.status !== 'done');
              if (!isDupTask) {
                const matchedChild = children.find(c => c.name.toLowerCase() === (item.child || '').toLowerCase());
                const newTask = await addTask({
                  family_id: familyId,
                  child_id: matchedChild?.id || null,
                  title: taskTitle,
                  description: item.summary || null,
                  assigned_to: (item.data.assigned_to as string) || null,
                  due_date: (item.data.due_date as string) || null,
                  status: 'pending', priority: 'normal', source: 'chat',
                  auto_detected: true, created_by: currentParent, completed_at: null,
                });
                setTasks(prev => [...prev, newTask]);
                createdCount++;
                console.log('[Catchup] Created task:', taskTitle);
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


  const renderIntentBadge = (intent: NannyIntent | undefined, hasPendingMed: boolean) => {
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
      // Legacy intents (backward compatibility)
      EVENT: { icon: <CalendarDays size={16} />, label: 'Evento registrado', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      TASK: { icon: <CheckSquare size={16} />, label: 'Tarea registrada', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
    };

    const config = badgeConfig[intent];
    if (!config) return null;

    // Skip the standalone badge for MEDICATION when pending confirm is active (buttons shown separately)
    if (intent === 'MEDICATION' && hasPendingMed) return null;

    // Determine navigation target based on intent
    const intentNav: Record<string, string> = {
      EVENT_SCHOOL: '/hoy', EVENT_ACTIVITY: '/hoy', EVENT_MEDICAL: '/hoy', MILESTONE: '/hoy',
      TASK_SHOPPING: '/hoy', TASK_PAYMENT: '/hoy', SUPPLY_LOW: '/hoy',
      MEDICATION: '/hoy', LOGISTICS_PICKUP: '/semana', LOGISTICS_TRANSPORT: '/semana',
      SCHEDULE_CHANGE: '/semana', HEALTH_LOG: '/hijo',
      EVENT: '/hoy', TASK: '/hoy',
    };
    const navTarget = intentNav[intent];

    return (
      <button
        onClick={() => navTarget && router.push(navTarget)}
        className={`flex items-center gap-1.5 mt-2 pt-2 border-t ${config.borderColor} w-full hover:opacity-80 transition-opacity`}
      >
        <span className={config.color}>{config.icon}</span>
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        {navTarget && <ChevronRight size={14} className={`ml-auto ${config.color} opacity-50`} />}
      </button>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col" style={{ height: 'calc(100dvh - 64px - env(safe-area-inset-bottom, 12px) - 20px)' }}>
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 shrink-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Participant avatars - stacked */}
            <div className="flex -space-x-2">
              <div className="w-10 h-10 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center ring-2 ring-white z-10">
                <Bot size={20} className="text-white" />
              </div>
              {parents.map((p, i) => (
                <div
                  key={p.id}
                  className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white ${
                    p.id === currentParent ? 'bg-[var(--nanny-purple-bg)]' : 'bg-[var(--nanny-gray-light)]'
                  }`}
                  style={{ zIndex: parents.length - i }}
                >
                  <UserIcon size={18} className={p.id === currentParent ? 'text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'} />
                </div>
              ))}
            </div>
            <div>
              <h1 className="font-semibold text-base">Chat Familiar</h1>
              <p className="text-xs text-[var(--nanny-gray)]">
                {onboardingMode
                  ? (onboardingSaving ? 'Creando tu familia...' : 'Nanny')
                  : <>Nanny{parents.map(p => `, ${p.name}`).join('')}</>
                }
              </p>
            </div>
          </div>
          {!onboardingMode && (
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                className="p-2 rounded-full hover:bg-[var(--nanny-gray-light)] transition-colors"
              >
                <MoreVertical size={20} className="text-[var(--nanny-gray)]" />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-10 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[180px] animate-fade-in">
                  <button
                    onClick={() => { setShowHeaderMenu(false); runCatchup(); }}
                    disabled={catchingUp || messages.length === 0}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-[var(--nanny-gray-light)] disabled:opacity-40 text-left"
                  >
                    <RefreshCw size={16} className={catchingUp ? 'animate-spin text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'} />
                    Ponte al d&iacute;a
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Pending detection — interactive card */}
        {pendingDetection && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3 animate-slide-up">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-800">{pendingDetection.summary}</p>
                {pendingDetection.missing.length > 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Falta: {pendingDetection.missing.join(', ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPendingDetection(null)}
                className="text-amber-400 hover:text-amber-600 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            {pendingDetection.missing.length > 0 && (
              <button
                onClick={() => {
                  setInput(`${pendingDetection.missing[0]}: `);
                  inputRef.current?.focus();
                }}
                className="mt-2 w-full text-center text-[11px] font-medium text-amber-700 bg-amber-100 rounded-lg py-1.5 hover:bg-amber-200 transition-colors"
              >
                Responder
              </button>
            )}
          </div>
        )}
      </div>

      {/* Push notification prompt */}
      {pushStatus === 'prompt' && (
        <div className="mx-4 mt-2 flex items-center gap-3 bg-[var(--nanny-purple-bg)] rounded-xl px-4 py-3">
          <Bell size={20} className="text-[var(--nanny-purple)] shrink-0" />
          <p className="text-sm text-[var(--nanny-purple)] flex-1">
            Activa las notificaciones para no perderte mensajes
          </p>
          <button
            onClick={async () => {
              const ok = await registerPushNotifications();
              setPushStatus(ok ? 'granted' : 'denied');
            }}
            className="text-xs font-semibold text-white bg-[var(--nanny-purple)] px-3 py-1.5 rounded-lg shrink-0"
          >
            Activar
          </button>
          <button onClick={() => setPushStatus('denied')} className="text-[var(--nanny-gray)] shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toast de confirmación */}
      {toast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-slide-up"
          style={{ maxWidth: '400px', width: '90%' }}
        >
          <button
            onClick={() => { setToast(null); router.push(toast.href); }}
            className="w-full flex items-center gap-2 bg-[var(--nanny-purple)] text-white rounded-xl px-4 py-3 shadow-lg"
          >
            <CheckSquare size={16} />
            <span className="text-sm font-medium flex-1 text-left">{toast.text}</span>
            <span className="text-xs opacity-80">Ver &rarr;</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-4" onClick={() => showHeaderMenu && setShowHeaderMenu(false)}>
        {/* Empty state con sugerencias tappables */}
        {messages.length === 0 && !nannyThinking && dataLoaded && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-4">
              <Bot size={32} className="text-[var(--nanny-purple)]" />
            </div>
            <p className="text-sm text-[var(--nanny-gray)] mb-1 text-center">Escr&iacute;bele a Nanny como le hablar&iacute;as a tu pareja</p>
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
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="w-full text-left px-4 py-3 bg-[var(--nanny-gray-light)] rounded-xl text-sm text-[var(--nanny-gray)] hover:bg-[var(--nanny-purple-bg)] hover:text-[var(--nanny-purple)] transition-colors"
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isNanny = msg.sender_type === 'nanny';
          const isCurrentParent = onboardingMode
            ? msg.sender_type === 'parent'
            : msg.sender_id === currentParent;
          const senderParent = parents.find(p => p.id === msg.sender_id);
          const isOtherParent = !isNanny && !isCurrentParent;

          // Date separator — show if first message or different day from previous
          const msgDate = new Date(msg.created_at).toDateString();
          const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at).toDateString() : null;
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
              <SwipeableMessage onSwipe={() => { setReplyingTo(msg); inputRef.current?.focus(); }}>
              <div className={`flex ${isCurrentParent ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              {/* Avatar circle for other parent */}
              {isOtherParent && (
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-5 shrink-0">
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
                  {isNanny && renderIntentBadge(msg.metadata?.intent as NannyIntent, !!pendingMedConfirm)}
                  {isNanny && msg.metadata?.intent === 'MEDICATION' && pendingMedConfirm && (
                    <div className="mt-3 pt-2 border-t border-[var(--nanny-purple-light)]">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pill size={16} className="text-[var(--nanny-purple)]" />
                        <span className="text-xs font-medium text-[var(--nanny-purple)]">¿Crear recordatorios?</span>
                      </div>
                      {/* Time editor */}
                      {editingMedTimes && (
                        <div className="mb-3 space-y-2">
                          <p className="text-[10px] text-[var(--nanny-gray)]">Ajusta los horarios:</p>
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
                                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]"
                              />
                              {editingMedTimes.length > 1 && (
                                <button
                                  onClick={() => setEditingMedTimes(editingMedTimes.filter((_, j) => j !== i))}
                                  className="text-[var(--nanny-gray)] hover:text-[var(--nanny-red)]"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => setEditingMedTimes([...editingMedTimes, '12:00'])}
                            className="text-[10px] text-[var(--nanny-purple)] font-medium"
                          >
                            + Agregar horario
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (editingMedTimes && pendingMedConfirm) {
                              setPendingMedConfirm({
                                ...pendingMedConfirm,
                                data: { ...pendingMedConfirm.data, schedule_times: editingMedTimes },
                              });
                              setEditingMedTimes(null);
                            }
                            handleMedicationConfirm('confirm');
                          }}
                          className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-purple)] text-white text-xs font-semibold"
                        >
                          {editingMedTimes ? 'Confirmar' : 'Sí, crear'}
                        </button>
                        {!editingMedTimes && (
                          <button
                            onClick={() => {
                              const times = (pendingMedConfirm?.data?.schedule_times as string[]) || ['08:00'];
                              setEditingMedTimes([...times]);
                            }}
                            className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-purple-bg)] text-[var(--nanny-purple)] text-xs font-semibold"
                          >
                            Editar horarios
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingMedTimes(null); handleMedicationConfirm('reject'); }}
                          className="flex-1 py-2 px-3 rounded-lg bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)] text-xs font-semibold"
                        >
                          No
                        </button>
                      </div>
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
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, false)}
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-red)] transition-colors"
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </>
                    )}
                    <span className="text-xs text-[var(--nanny-gray)]">
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {!isNanny && !onboardingMode && (
                  <p className={`text-xs text-[var(--nanny-gray)] mt-0.5 ${isCurrentParent ? 'text-right mr-1' : 'ml-1'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
            </SwipeableMessage>
            </div>
          );
        })}
        {nannyWaiting && !nannyThinking && (
          <div className="flex justify-center animate-fade-in">
            <p className="text-xs text-[var(--nanny-gray)] bg-[var(--nanny-gray-light)] rounded-full px-3 py-1">
              Puedes seguir escribiendo...
            </p>
          </div>
        )}
        {nannyThinking && (
          <div className="flex justify-start animate-fade-in">
            <div>
              <p className="text-xs mb-1 ml-1 inline-flex items-center gap-1 text-[var(--nanny-purple)] font-medium"><Bot size={14} /> Nanny</p>
              <div className="bubble-nanny">
                <div className="flex gap-1.5 py-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-3 py-2">
        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 px-1 animate-slide-up">
            <div className="flex-1 pl-3 border-l-2 border-[var(--nanny-purple)] rounded-sm min-w-0">
              <p className="text-xs font-medium text-[var(--nanny-purple)]">
                {replyingTo.sender_type === 'nanny' ? 'Nanny' : (parents.find(p => p.id === replyingTo.sender_id)?.name || 'Tú')}
              </p>
              <p className="text-xs text-[var(--nanny-gray)] truncate">{replyingTo.content}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 text-[var(--nanny-gray)]">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onboardingMode ? sendOnboardingMessage() : sendMessage();
              }
            }}
            placeholder={onboardingMode && onboardingSaving ? 'Espera un momento...' : 'Escribe un mensaje...'}
            disabled={onboardingMode && (onboardingSending || onboardingSaving)}
            className="flex-1 bg-[var(--nanny-gray-light)] rounded-full px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] disabled:opacity-50"
          />
          <button
            onClick={onboardingMode ? sendOnboardingMessage : sendMessage}
            disabled={!input.trim() || (onboardingMode && (onboardingSending || onboardingSaving))}
            className="w-12 h-12 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
          >
            <Send size={20} className="text-white ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
