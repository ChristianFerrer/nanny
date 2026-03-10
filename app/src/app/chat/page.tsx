'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot } from 'lucide-react';
import { getMessages, addMessage, getParents, getChildren, getFamily } from '@/lib/store';
import type { Message, Parent, Child } from '@/lib/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [familyId, setFamilyId] = useState<string>('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [currentParent, setCurrentParent] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [fam, msgs, prts, chld] = await Promise.all([
      getFamily(), getMessages(), getParents(), getChildren(),
    ]);
    setFamilyId(fam.id);
    setMessages(msgs);
    setParents(prts);
    setChildren(chld);
    if (prts.length > 0 && !currentParent) {
      setCurrentParent(prts[0].id);
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
    if (!text || sending) return;

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

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          familyContext: familyCtx,
          recentMessages: recentMsgs,
        }),
      });

      const data = await res.json();

      const nannyMsg = await addMessage({
        family_id: familyId,
        sender_id: null,
        sender_type: 'nanny',
        content: data.reply || data.error || 'Hmm, no entendí. ¿Puedes repetir?',
        message_type: data.confirmation ? 'confirmation' : 'text',
        metadata: {
          intent: data.intent,
          child: data.child,
        },
      });
      setMessages(prev => [...prev, nannyMsg]);
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

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Chat Familiar</h1>
            <p className="text-[10px] text-[var(--nanny-gray)]">
              {children.map(c => `${c.emoji} ${c.name}`).join('  ')}
            </p>
          </div>
        </div>
        {/* Parent switcher */}
        <button
          onClick={() => setCurrentParent(otherParent?.id || currentParent)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--nanny-purple-bg)] text-xs font-medium text-[var(--nanny-purple)]"
        >
          <span className="text-base">{currentParentObj?.avatar_emoji}</span>
          {currentParentObj?.name}
        </button>
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
                    <button className="text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors">
                      <ThumbsUp size={12} />
                    </button>
                    <button className="text-[var(--nanny-gray)] hover:text-[var(--nanny-red)] transition-colors">
                      <ThumbsDown size={12} />
                    </button>
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
