'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowLeft, Plus, X, Copy, Share2, Check, MessageCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type Step = 'family' | 'children' | 'invite' | 'wow';

interface ChildForm {
  name: string;
  age: string;
  emoji: string;
}

const CHILD_EMOJIS = ['👦', '👧', '👶', '🧒', '👦🏽', '👧🏻', '🧒🏾', '👶🏻'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('family');
  const [familyName, setFamilyName] = useState('');
  const [children, setChildren] = useState<ChildForm[]>([
    { name: '', age: '', emoji: '👦' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserName, setAuthUserName] = useState('');
  const [copied, setCopied] = useState(false);
  const [createdChildren, setCreatedChildren] = useState<{ name: string; emoji: string; age: string }[]>([]);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthUserId(user.id);
        // Extract name from email as fallback
        const emailName = user.email?.split('@')[0] || '';
        setAuthUserName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
      }
    });
  }, []);

  const addChild = () => {
    const nextEmoji = CHILD_EMOJIS[children.length % CHILD_EMOJIS.length];
    setChildren([...children, { name: '', age: '', emoji: nextEmoji }]);
  };

  const removeChild = (index: number) => {
    if (children.length > 1) {
      setChildren(children.filter((_, i) => i !== index));
    }
  };

  const updateChild = (index: number, field: keyof ChildForm, value: string) => {
    setChildren(children.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const validChildren = children.filter(c => c.name.trim());

      // Calculate birth_date from age
      const childrenWithDates = validChildren.map(c => {
        const age = parseInt(c.age);
        let birth_date = null;
        if (!isNaN(age) && age >= 0) {
          const d = new Date();
          d.setFullYear(d.getFullYear() - age);
          birth_date = d.toISOString().split('T')[0];
        }
        return {
          name: c.name,
          birth_date,
          emoji: c.emoji,
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
          familyName: familyName || `Familia ${authUserName}`,
          parents: [{ name: authUserName, role: 'mama', avatar_emoji: '👩' }],
          children: childrenWithDates,
          authUserId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      // Save children info for the wow screen
      setCreatedChildren(validChildren.map(c => ({
        name: c.name,
        emoji: c.emoji,
        age: c.age,
      })));
      setStep('invite');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar. Verifica tu conexión.');
    }
    setSaving(false);
  };

  const inviteMessage = `Estoy probando una app que organiza las cosas de los niños automáticamente.\n\nÚnete aquí: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`;

  const handleCopyLink = () => {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/login`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;
    window.open(url, '_blank');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteMessage });
      } catch {
        // User cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-14 pb-2">
        {(['family', 'children', 'invite', 'wow'] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step ? 'w-6 bg-[var(--nanny-purple)]' : 'w-1.5 bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* STEP 1: Family name */}
      {step === 'family' && (
        <div className="flex flex-col items-center justify-center px-6 pt-12 animate-fade-in">
          <div className="text-5xl mb-6">👨‍👩‍👧‍👦</div>
          <h1 className="text-2xl font-bold mb-2 text-center">¿Cómo se llama tu familia?</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-8 text-center">
            Así identificaremos tu grupo familiar
          </p>

          <div className="w-full max-w-xs mb-8">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ej: Familia Ferrer"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-base text-center focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none"
              autoFocus
            />
          </div>

          <button
            onClick={() => setStep('children')}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* STEP 2: Add children — minimal: name + age */}
      {step === 'children' && (
        <div className="px-5 pt-8 pb-8 animate-fade-in">
          <button onClick={() => setStep('family')} className="mb-6 text-[var(--nanny-gray)]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold mb-1">Añade a tus hijos</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-6">Solo necesitamos nombre y edad</p>

          {children.map((child, i) => (
            <div key={i} className="mb-4 bg-[var(--nanny-gray-light)] rounded-2xl p-4 relative">
              {children.length > 1 && (
                <button
                  onClick={() => removeChild(i)}
                  className="absolute top-3 right-3 text-[var(--nanny-gray)] hover:text-[var(--nanny-red)]"
                >
                  <X size={16} />
                </button>
              )}

              {/* Emoji selector */}
              <div className="flex gap-1.5 mb-3">
                {CHILD_EMOJIS.slice(0, 6).map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => updateChild(i, 'emoji', emoji)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                      child.emoji === emoji ? 'bg-[var(--nanny-purple)] ring-2 ring-[var(--nanny-purple)]' : 'bg-white'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={child.name}
                  onChange={(e) => updateChild(i, 'name', e.target.value)}
                  placeholder="Nombre"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                  autoFocus={i === 0}
                />
                <input
                  type="number"
                  value={child.age}
                  onChange={(e) => updateChild(i, 'age', e.target.value)}
                  placeholder="Edad"
                  min="0"
                  max="18"
                  className="w-20 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white text-center"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addChild}
            className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-[var(--nanny-gray)] mb-6"
          >
            <Plus size={16} /> Añadir otro hijo
          </button>

          {error && (
            <p className="text-sm text-[var(--nanny-red)] text-center mb-3">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={!children.some(c => c.name.trim()) || saving}
            className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            {saving ? 'Creando familia...' : 'Siguiente'} {!saving && <ArrowRight size={16} />}
          </button>
        </div>
      )}

      {/* STEP 3: Invite partner */}
      {step === 'invite' && (
        <div className="px-5 pt-8 pb-8 animate-fade-in">
          <h1 className="text-2xl font-bold mb-1">Invita a tu pareja</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-8">
            Para organizar todo juntos
          </p>

          <div className="bg-[var(--nanny-gray-light)] rounded-2xl p-4 mb-6">
            <p className="text-sm text-[var(--nanny-gray)] italic leading-relaxed">
              &quot;Estoy probando una app que organiza las cosas de los niños automáticamente. Únete aquí.&quot;
            </p>
          </div>

          <div className="space-y-3 mb-8">
            <button
              onClick={handleShareWhatsApp}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-[#25D366] text-white font-medium text-sm"
            >
              <MessageCircle size={18} />
              Compartir por WhatsApp
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-gray-200 text-sm font-medium"
            >
              {copied ? <Check size={18} className="text-[var(--nanny-green)]" /> : <Copy size={18} />}
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>

            <button
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-gray-200 text-sm font-medium"
            >
              <Share2 size={18} />
              Enviar invitación
            </button>
          </div>

          <button
            onClick={() => setStep('wow')}
            className="w-full text-center text-sm text-[var(--nanny-gray)] py-3"
          >
            Saltar por ahora →
          </button>
        </div>
      )}

      {/* STEP 4: WOW moment */}
      {step === 'wow' && (
        <div className="flex flex-col items-center justify-center min-h-[80dvh] px-6 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-5">
            <span className="text-4xl">🤖</span>
          </div>
          <h1 className="text-2xl font-bold mb-3">Hola, soy Nanny</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-6 max-w-[280px] leading-relaxed">
            Puedo ayudarte a recordar:
          </p>

          <div className="w-full max-w-xs space-y-2.5 mb-8 text-left">
            <div className="flex items-center gap-3 bg-[var(--nanny-gray-light)] rounded-xl px-4 py-3">
              <span className="text-lg">📅</span>
              <span className="text-sm">Actividades de los niños</span>
            </div>
            <div className="flex items-center gap-3 bg-[var(--nanny-gray-light)] rounded-xl px-4 py-3">
              <span className="text-lg">🏥</span>
              <span className="text-sm">Citas médicas</span>
            </div>
            <div className="flex items-center gap-3 bg-[var(--nanny-gray-light)] rounded-xl px-4 py-3">
              <span className="text-lg">✅</span>
              <span className="text-sm">Tareas familiares</span>
            </div>
          </div>

          {createdChildren.length > 0 && (
            <div className="bg-[var(--nanny-purple-bg)] rounded-2xl p-4 mb-6 w-full max-w-xs">
              <p className="text-sm text-[var(--nanny-purple)] font-medium mb-2">Ya conozco a:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {createdChildren.map((c, i) => (
                  <span key={i} className="bg-white rounded-full px-3 py-1.5 text-sm">
                    {c.emoji} {c.name} — {c.age} años
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              window.location.href = '/chat';
            }}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm"
          >
            Ir al chat <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
