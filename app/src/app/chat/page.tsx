'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot, CalendarDays, CheckSquare, Bell, X, Pill, RefreshCw, Thermometer, ShoppingCart, CreditCard, Car, Clock, AlertTriangle } from 'lucide-react';
import { getMessages, getNewMessages, addMessage, addEvent, addTask, addMedication, getMedications, getParents, getChildren, getFamily, getEvents, getTasks, getCurrentParentId } from '@/lib/store';
import { registerPushNotifications, sendPushToFamily } from '@/lib/push';
import { validateNannyResponse } from '@/lib/validation';
import type { Message, Parent, Child, FamilyEvent, Task, Medication, NannyIntent } from '@/lib/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [familyId, setFamilyId] = useState<string>('');
  const [input, setInput] = useState('');
  const [currentParent, setCurrentParent] = useState<string>('');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const [pushStatus, setPushStatus] = useState<'idle' | 'prompt' | 'granted' | 'denied'>('idle');
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
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
        // Use the authenticated user's parent ID, fallback to first parent
        const myParentId = getCurrentParentId();
        const matchedParent = myParentId && prts.find(p => p.id === myParentId);
        setCurrentParent(matchedParent ? matchedParent.id : prts[0].id);
      }
    } catch {
      window.location.href = '/login';
    }
  }, [currentParent]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          content: `⚠️ ${rawData.error}`,
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
            }
          } catch {
            console.error('Failed to auto-create event/task');
          }
        }

        if (data.pending_detection && data.pending_detection.type) {
          setPendingDetection(data.pending_detection);
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
        content: '⚠️ Ups, tuve un problema. Intenta de nuevo.',
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
    const parentMsg = await addMessage({
      family_id: familyId,
      sender_id: currentParent,
      sender_type: 'parent',
      content: text,
      message_type: 'text',
      metadata: {},
    });
    setMessages(prev => [...prev, parentMsg]);

    sendPushToFamily(
      familyId,
      `${currentParentObj?.avatar_emoji} ${currentParentObj?.name}`,
      text,
      currentParent
    );

    // Process Nanny AI in background — input stays free
    processNannyResponse(text, parentMsg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
              title: `💊 ${medName} - ${childName} en 10 min`,
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
          content: `✅ Listo! Creé el tratamiento de ${medName} para ${childName}. Les avisaré 10 minutos antes de cada toma 📅`,
          message_type: 'text',
          metadata: { intent: 'MEDICATION', child: childName },
        });
        setMessages(prev => [...prev, confirmMsg]);
        sendPushToFamily(familyId, '💊 Nanny', `Recordatorios de ${medName} para ${childName} activados. Les avisaré 10 min antes de cada toma.`);
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
          content: `⚠️ ${data.error}`, message_type: 'text', metadata: {},
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
        content: '⚠️ Ups, tuve un problema al revisar el historial. Intenta de nuevo.',
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
      EVENT_SCHOOL: { icon: <CalendarDays size={14} />, label: 'Evento escolar', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      EVENT_ACTIVITY: { icon: <CalendarDays size={14} />, label: 'Actividad', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      EVENT_MEDICAL: { icon: <CalendarDays size={14} />, label: 'Cita médica', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      MILESTONE: { icon: <CalendarDays size={14} />, label: 'Fecha importante', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      TASK_SHOPPING: { icon: <ShoppingCart size={14} />, label: 'Compra pendiente', color: 'text-blue-600', borderColor: 'border-blue-200' },
      TASK_PAYMENT: { icon: <CreditCard size={14} />, label: 'Pago pendiente', color: 'text-blue-600', borderColor: 'border-blue-200' },
      SUPPLY_LOW: { icon: <AlertTriangle size={14} />, label: 'Suministro bajo', color: 'text-orange-600', borderColor: 'border-orange-200' },
      MEDICATION: { icon: <Pill size={14} />, label: hasPendingMed ? '¿Crear recordatorios?' : 'Tratamiento registrado', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      LOGISTICS_PICKUP: { icon: <Car size={14} />, label: 'Recogida asignada', color: 'text-green-600', borderColor: 'border-green-200' },
      LOGISTICS_TRANSPORT: { icon: <Car size={14} />, label: 'Transporte', color: 'text-green-600', borderColor: 'border-green-200' },
      SCHEDULE_CHANGE: { icon: <Clock size={14} />, label: 'Cambio de horario', color: 'text-amber-600', borderColor: 'border-amber-200' },
      HEALTH_LOG: { icon: <Thermometer size={14} />, label: 'Síntoma registrado', color: 'text-amber-600', borderColor: 'border-amber-200' },
      // Legacy intents (backward compatibility)
      EVENT: { icon: <CalendarDays size={14} />, label: 'Evento registrado', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
      TASK: { icon: <CheckSquare size={14} />, label: 'Tarea registrada', color: 'text-[var(--nanny-purple)]', borderColor: 'border-[var(--nanny-purple-light)]' },
    };

    const config = badgeConfig[intent];
    if (!config) return null;

    // Skip the standalone badge for MEDICATION when pending confirm is active (buttons shown separately)
    if (intent === 'MEDICATION' && hasPendingMed) return null;

    return (
      <div className={`flex items-center gap-1.5 mt-2 pt-2 border-t ${config.borderColor}`}>
        <span className={config.color}>{config.icon}</span>
        <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Participant avatars - stacked */}
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center ring-2 ring-white z-10">
                <Bot size={16} className="text-white" />
              </div>
              {parents.map((p, i) => (
                <div
                  key={p.id}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-base ring-2 ring-white ${
                    p.id === currentParent ? 'bg-[var(--nanny-purple-bg)]' : 'bg-[var(--nanny-gray-light)]'
                  }`}
                  style={{ zIndex: parents.length - i }}
                >
                  {p.avatar_emoji}
                </div>
              ))}
            </div>
            <div>
              <h1 className="font-semibold text-sm">Chat Familiar</h1>
              <p className="text-[10px] text-[var(--nanny-gray)]">
                Nanny{parents.map(p => `, ${p.name}`).join('')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Catch-up button */}
            <button
              onClick={runCatchup}
              disabled={catchingUp || messages.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[var(--nanny-gray-light)] text-xs font-medium text-[var(--nanny-gray)] disabled:opacity-40 transition-opacity"
              title="Nanny re-lee todo el chat"
            >
              <RefreshCw size={13} className={catchingUp ? 'animate-spin' : ''} />
              <span className="hidden min-[380px]:inline">Re-leer</span>
            </button>
            {/* Current parent indicator + switcher */}
            {parents.length > 1 ? (
              <button
                onClick={() => setCurrentParent(otherParent?.id || currentParent)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--nanny-purple-bg)] text-xs font-medium text-[var(--nanny-purple)]"
                title="Cambiar quién escribe"
              >
                <span className="text-base">{currentParentObj?.avatar_emoji}</span>
                Yo
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--nanny-purple-bg)] text-xs font-medium text-[var(--nanny-purple)]">
                <span className="text-base">{currentParentObj?.avatar_emoji}</span>
                Yo
              </div>
            )}
          </div>
        </div>
        {/* Children strip */}
        {children.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {children.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--nanny-gray-light)] rounded-full text-[10px] text-[var(--nanny-gray)] whitespace-nowrap">
                {c.emoji} {c.name}
              </span>
            ))}
          </div>
        )}
        {/* Pending detection indicator */}
        {pendingDetection && (
          <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] text-amber-700 font-medium">
              Escuchando: {pendingDetection.summary}
            </span>
            <button
              onClick={() => setPendingDetection(null)}
              className="ml-auto text-amber-400 hover:text-amber-600"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Push notification prompt */}
      {pushStatus === 'prompt' && (
        <div className="mx-4 mt-2 flex items-center gap-3 bg-[var(--nanny-purple-bg)] rounded-xl px-4 py-3">
          <Bell size={18} className="text-[var(--nanny-purple)] shrink-0" />
          <p className="text-xs text-[var(--nanny-purple)] flex-1">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-32">
        {messages.map((msg) => {
          const isNanny = msg.sender_type === 'nanny';
          const isCurrentParent = msg.sender_id === currentParent;
          const senderParent = parents.find(p => p.id === msg.sender_id);

          return (
            <div
              key={msg.id}
              className={`flex ${isCurrentParent ? 'justify-end' : 'justify-start'} animate-slide-up`}
            >
              <div className="max-w-[85%]">
                {/* Sender label */}
                <p className={`text-[10px] text-[var(--nanny-gray)] mb-1 ${isCurrentParent ? 'text-right mr-1' : 'ml-1'}`}>
                  {isNanny ? '🤖 Nanny' : `${senderParent?.avatar_emoji || currentParentObj?.avatar_emoji} ${senderParent?.name || currentParentObj?.name}`}
                </p>
                <div className={
                  isNanny ? 'bubble-nanny' :
                  isCurrentParent ? 'bubble-parent' : 'bubble-other-parent'
                }>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {/* Intent badges */}
                  {isNanny && renderIntentBadge(msg.metadata?.intent as NannyIntent, !!pendingMedConfirm)}
                  {isNanny && msg.metadata?.intent === 'MEDICATION' && pendingMedConfirm && (
                    <div className="mt-3 pt-2 border-t border-[var(--nanny-purple-light)]">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pill size={14} className="text-[var(--nanny-purple)]" />
                        <span className="text-[11px] font-medium text-[var(--nanny-purple)]">¿Crear recordatorios?</span>
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
                {isNanny && (
                  <div className="flex gap-2 mt-1 ml-1">
                    {feedbackGiven[msg.id] ? (
                      <span className="text-[10px] text-[var(--nanny-gray)]">
                        {feedbackGiven[msg.id] === 'up' ? '👍 Gracias' : '👎 Anotado'}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFeedback(msg.id, true)}
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors"
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          onClick={() => handleFeedback(msg.id, false)}
                          className="text-[var(--nanny-gray)] hover:text-[var(--nanny-red)] transition-colors"
                        >
                          <ThumbsDown size={12} />
                        </button>
                      </>
                    )}
                    <span className="text-[9px] text-[var(--nanny-gray)]">
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {!isNanny && (
                  <p className={`text-[9px] text-[var(--nanny-gray)] mt-0.5 ${isCurrentParent ? 'text-right mr-1' : 'ml-1'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {nannyThinking && (
          <div className="flex justify-start animate-fade-in">
            <div>
              <p className="text-[10px] text-[var(--nanny-gray)] mb-1 ml-1">🤖 Nanny</p>
              <div className="bubble-nanny">
                <div className="flex gap-1 py-1">
                  <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-[var(--nanny-gray-light)] rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send size={18} className="text-white ml-0.5" />
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
