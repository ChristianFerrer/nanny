'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, Send } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface ExtractedData {
  parent_name: string | null;
  parent_role: 'mama' | 'papa' | null;
  children: { name: string; age: number }[];
  family_name: string | null;
}

const CHILD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

export default function OnboardingPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData>({
    parent_name: null,
    parent_role: null,
    children: [],
    family_name: null,
  });
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initiated = useRef(false);

  // Get auth user
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthUserId(user.id);
        setAuthEmail(user.email || '');
      }
    });
  }, []);

  // Typewriter effect
  const typeMessage = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      setIsTyping(true);
      setTypingText('');
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setTypingText(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setIsTyping(false);
          setTypingText('');
          resolve();
        }
      }, 20);
    });
  };

  // Start conversation on mount
  useEffect(() => {
    if (initiated.current) return;
    initiated.current = true;

    const startChat = async () => {
      setSending(true);
      try {
        const res = await fetch('/api/onboarding-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '[INICIO - el usuario acaba de llegar a la pantalla de onboarding. Salúdalo y comienza preguntando su nombre.]' }],
          }),
        });
        const data = await res.json();
        if (data.reply) {
          await typeMessage(data.reply);
          setMessages([{ role: 'assistant', content: data.reply }]);
          if (data.extracted) setExtracted(data.extracted);
        }
      } catch {
        setMessages([{ role: 'assistant', content: '¡Hola! Soy Nanny 🤖 ¿Cómo te llamas?' }]);
      }
      setSending(false);
    };
    startChat();
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typingText]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || saving) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      // Build conversation history for API (exclude the hidden init message)
      const apiMessages = newMessages.map(m => ({
        role: m.role as 'assistant' | 'user',
        content: m.content,
      }));

      const res = await fetch('/api/onboarding-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();

      if (data.reply) {
        await typeMessage(data.reply);
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        if (data.extracted) setExtracted(data.extracted);

        // If confirmed, save the family
        if (data.confirmed && data.extracted) {
          await saveFamily(data.extracted);
        }
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Ups, hubo un error. ¿Puedes intentar de nuevo?' }]);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const saveFamily = async (data: ExtractedData) => {
    setSaving(true);
    try {
      const parentName = data.parent_name || authEmail.split('@')[0] || 'Padre';
      const parentRole = data.parent_role || 'mama';
      const familyName = data.family_name || `Familia ${parentName}`;

      const childrenWithDates = data.children.map((c, i) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - c.age);
        return {
          name: c.name,
          birth_date: d.toISOString().split('T')[0],
          emoji: CHILD_COLORS[i % CHILD_COLORS.length],
          school: null,
          teacher: null,
          grade: null,
          allergies: [],
        };
      });

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyName,
          parents: [{ name: parentName, role: parentRole, avatar_emoji: parentRole }],
          children: childrenWithDates,
          authUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar');
      }

      // Success — redirect after a brief moment
      setTimeout(() => {
        window.location.href = '/chat';
      }, 1500);
    } catch (err) {
      console.error('Save error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Hubo un error al crear tu familia. ¿Puedes intentar de nuevo?',
      }]);
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 pt-[env(safe-area-inset-top,12px)]">
        <div className="w-10 h-10 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center">
          <Bot size={20} className="text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-sm">Nanny</h1>
          <p className="text-[10px] text-[var(--nanny-gray)]">
            {saving ? 'Creando tu familia...' : 'Configurando tu cuenta'}
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="px-4 py-2 bg-[var(--nanny-purple-bg)]">
        <div className="flex items-center gap-2">
          {['Nombre', 'Rol', 'Hijos'].map((label, i) => {
            const done = i === 0 ? !!extracted.parent_name
              : i === 1 ? !!extracted.parent_role
              : extracted.children.length > 0;
            return (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  done ? 'bg-[var(--nanny-purple)] text-white' : 'bg-gray-200 text-[var(--nanny-gray)]'
                }`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] ${done ? 'text-[var(--nanny-purple)] font-medium' : 'text-[var(--nanny-gray)]'}`}>
                  {label}
                </span>
                {i < 2 && <div className="w-4 h-px bg-gray-200 mx-0.5" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center mr-2 mt-1 shrink-0">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] ${
              msg.role === 'user'
                ? 'bg-[var(--nanny-purple)] text-white rounded-br-md'
                : 'bg-[var(--nanny-gray-light)] text-gray-800 rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Typing indicator / typewriter */}
        {(isTyping || sending) && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center mr-2 mt-1 shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 bg-[var(--nanny-gray-light)] text-gray-800 rounded-bl-md">
              {typingText ? (
                <p className="text-[15px] whitespace-pre-wrap">{typingText}<span className="animate-pulse">|</span></p>
              ) : (
                <div className="flex gap-1 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Saving state */}
        {saving && (
          <div className="flex justify-center">
            <div className="bg-[var(--nanny-purple-bg)] rounded-2xl px-4 py-3 text-sm text-[var(--nanny-purple)] font-medium animate-pulse">
              Creando tu familia...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={saving ? 'Espera un momento...' : 'Escribe tu respuesta...'}
            disabled={sending || saving}
            className="flex-1 bg-[var(--nanny-gray-light)] rounded-full px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending || saving}
            className="w-11 h-11 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0"
          >
            <Send size={18} className="text-white ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
