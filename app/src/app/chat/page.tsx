'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot } from 'lucide-react';
import { getMessages, addMessage, addEvent, addTask, getParents, getChildren, getFamily, getEvents, getTasks, getCurrentParentId } from '@/lib/store';
import type { Message, Parent, Child, FamilyEvent, Task } from '@/lib/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [familyId, setFamilyId] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [currentParent, setCurrentParent] = useState<string>('');
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const [fam, msgs, prts, chld, evts, tsks] = await Promise.all([
        getFamily(), getMessages(), getParents(), getChildren(), getEvents(), getTasks(),
      ]);
      if (!fam) { window.location.href = '/login'; return; }
      setFamilyId(fam.id);
      setMessages(msgs);
      setParents(prts);
      setChildren(chld);
      setEvents(evts);
      setTasks(tsks);
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

  const currentParentObj = parents.find(p => p.id === currentParent);
  const otherParent = parents.find(p => p.id !== currentParent);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sendingRef.current) return;

    sendingRef.current = true;
    setInput('');
    setSending(true);

    // Add parent message
    const parentMsg = await addMessage({
      family_id: familyId,
      sender_id: currentParent,
      sender_type: 'parent',
      content: text,
      message_type: 'text',
      metadata: {},
    });
    setMessages(prev => [...prev, parentMsg]);

    try {
      // Build context
      const recentMsgs = [...messages.slice(-10), parentMsg]
        .map(m => {
          const sender = m.sender_type === 'nanny' ? 'Nanny'
            : parents.find(p => p.id === m.sender_id)?.name || 'Padre';
          return `${sender}: ${m.content}`;
        }).join('\n');

      const familyCtx = `Familia: ${children.map(c => `${c.name} (${c.emoji}, ${c.birth_date ? calcAge(c.birth_date) : '?'} años${c.school ? `, va a ${c.school}` : ''})`).join(', ')}. Padres: ${parents.map(p => `${p.name} (${p.avatar_emoji})`).join(' y ')}.`;

      // Include existing events/tasks so AI knows what's already scheduled
      const existingEvents = events.slice(-10).map(e =>
        `- ${e.title} (${e.event_type}, ${new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}${e.location ? `, ${e.location}` : ''})`
      ).join('\n');
      const existingTasks = tasks.filter(t => t.status !== 'done').slice(-10).map(t =>
        `- ${t.title} (${t.priority}${t.due_date ? `, vence ${new Date(t.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''})`
      ).join('\n');

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          familyContext: familyCtx,
          recentMessages: recentMsgs,
          existingEvents,
          existingTasks,
          senderName: currentParentObj?.name || 'Padre',
        }),
      });

      const data = await res.json();

      if (data.error) {
        // Show API error as a local message (don't persist errors to DB)
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          family_id: familyId,
          sender_id: null,
          sender_type: 'nanny',
          content: `⚠️ ${data.error}`,
          message_type: 'text',
          metadata: {},
          created_at: new Date().toISOString(),
        }]);
      } else {
        // Auto-create event/task if Nanny detected one
        if (data.confirmation) {
          const { type, data: confData } = data.confirmation;
          try {
            if (type === 'event') {
              const dateStart = (confData.date_start as string) || new Date().toISOString();
              const title = (confData.title as string) || 'Evento';
              // Deduplicate: skip if same title + same day already exists
              const newDay = dateStart.split('T')[0];
              const isDuplicate = events.some(e =>
                e.title.toLowerCase() === title.toLowerCase() &&
                e.date_start.split('T')[0] === newDay
              );
              if (isDuplicate) {
                console.log('Skipped duplicate event:', title, newDay);
              } else {
              const newEvent = await addEvent({
                family_id: familyId,
                child_id: null,
                title,
                description: (confData.date_description as string) || null,
                event_type: (confData.event_type as string) || 'other',
                date_start: dateStart,
                date_end: null,
                location: (confData.location as string) || null,
                status: 'pending',
                source: 'chat',
                auto_detected: true,
                created_by: currentParent,
              });
              setEvents(prev => [...prev, newEvent]);
              }
            } else if (type === 'task') {
              const taskTitle = (confData.title as string) || 'Tarea';
              const isDupTask = tasks.some(t =>
                t.title.toLowerCase() === taskTitle.toLowerCase() && t.status !== 'done'
              );
              if (!isDupTask) {
              const newTask = await addTask({
                family_id: familyId,
                child_id: null,
                title: taskTitle,
                description: null,
                assigned_to: (confData.assigned_to as string) || null,
                due_date: (confData.due_date as string) || null,
                status: 'pending',
                priority: 'normal',
                source: 'chat',
                auto_detected: true,
                created_by: currentParent,
                completed_at: null,
              });
              setTasks(prev => [...prev, newTask]);
              }
            }
          } catch {
            console.error('Failed to auto-create event/task');
          }
        }

        const nannyMsg = await addMessage({
          family_id: familyId,
          sender_id: null,
          sender_type: 'nanny',
          content: data.reply || 'Hmm, no entendí. ¿Puedes repetir?',
          message_type: 'text',
          metadata: {
            intent: data.intent,
            child: data.child,
          },
        });
        setMessages(prev => [...prev, nannyMsg]);
      }
    } catch {
      const errorMsg = await addMessage({
        family_id: familyId,
        sender_id: null,
        sender_type: 'nanny',
        content: '⚠️ Ups, tuve un problema. Intenta de nuevo.',
        message_type: 'text',
        metadata: {},
      });
      setMessages(prev => [...prev, errorMsg]);
    }

    sendingRef.current = false;
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-20">
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
                {!isCurrentParent && (
                  <p className="text-[10px] text-[var(--nanny-gray)] mb-1 ml-1">
                    {isNanny ? '🤖 Nanny' : `${senderParent?.avatar_emoji} ${senderParent?.name}`}
                  </p>
                )}
                <div className={
                  isNanny ? 'bubble-nanny' :
                  isCurrentParent ? 'bubble-parent' : 'bubble-other-parent'
                }>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                {isCurrentParent && (
                  <p className="text-[9px] text-[var(--nanny-gray)] text-right mt-0.5 mr-1">
                    {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start animate-fade-in">
            <div className="bubble-nanny">
              <div className="flex gap-1 py-1">
                <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple-light)] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple-light)] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[var(--nanny-purple-light)] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-[var(--nanny-gray-light)] rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
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
