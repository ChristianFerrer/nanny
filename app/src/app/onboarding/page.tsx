'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowLeft, Plus, X, Bot } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

type Step = 'children' | 'family' | 'wow';

interface ChildForm {
  name: string;
  age: string;
  emoji: string;
}

const CHILD_EMOJIS = ['👦', '👧', '👶', '🧒', '👦🏽', '👧🏻', '🧒🏾', '👶🏻'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('children');
  const [familyName, setFamilyName] = useState('');
  const [children, setChildren] = useState<ChildForm[]>([
    { name: '', age: '', emoji: '👦' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserName, setAuthUserName] = useState('');
  const [parentRole, setParentRole] = useState<'mama' | 'papa'>('mama');
  const [createdChildren, setCreatedChildren] = useState<{ name: string; emoji: string; age: string }[]>([]);
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthUserId(user.id);
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

      const computedFamilyName = familyName || `Familia ${authUserName}`;

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyName: computedFamilyName,
          parents: [{ name: authUserName, role: parentRole, avatar_emoji: parentRole === 'mama' ? '👩' : '👨' }],
          children: childrenWithDates,
          authUserId,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Error al guardar');
      }

      setCreatedChildren(validChildren.map(c => ({
        name: c.name,
        emoji: c.emoji,
        age: c.age,
      })));
      setStep('wow');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar. Verifica tu conexión.');
    }
    setSaving(false);
  };

  // Mini demo interactivo
  const demoChildName = children.find(c => c.name.trim())?.name || 'Lucas';
  const demoMessage = `${demoChildName} tiene dentista mañana a las 4`;
  const demoSteps = [
    { sender: 'parent', text: demoMessage },
    { sender: 'nanny', text: `📅 Listo! Registré la cita del dentista de ${demoChildName} para mañana a las 16:00. Les avisaré antes.` },
  ];

  // Auto-advance demo
  useEffect(() => {
    if (step === 'wow' && demoStep < demoSteps.length) {
      const timer = setTimeout(() => setDemoStep(prev => prev + 1), demoStep === 0 ? 800 : 1500);
      return () => clearTimeout(timer);
    }
  }, [step, demoStep, demoSteps.length]);

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-14 pb-2">
        {(['children', 'family', 'wow'] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step ? 'w-6 bg-[var(--nanny-purple)]' : 'w-1.5 bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* STEP 1: Add children first — emotionally closer */}
      {step === 'children' && (
        <div className="px-5 pt-8 pb-8 animate-fade-in">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">👶</div>
            <h1 className="text-2xl font-bold mb-1">&iquest;C&oacute;mo se llaman tus hijos?</h1>
            <p className="text-sm text-[var(--nanny-gray)]">Nanny los va a cuidar bien</p>
          </div>

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
            <Plus size={16} /> A&ntilde;adir otro hijo
          </button>

          <button
            onClick={() => setStep('family')}
            disabled={!children.some(c => c.name.trim())}
            className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* STEP 2: Family name + role (simplified) */}
      {step === 'family' && (
        <div className="flex flex-col items-center justify-center px-6 pt-8 animate-fade-in">
          <button onClick={() => setStep('children')} className="self-start mb-4 text-[var(--nanny-gray)]">
            <ArrowLeft size={20} />
          </button>

          <h1 className="text-2xl font-bold mb-2 text-center">Casi listo</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-6 text-center">
            &iquest;C&oacute;mo se llama tu familia?
          </p>

          <div className="w-full max-w-xs mb-6">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder={`Familia ${authUserName}`}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-base text-center focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none"
            />
          </div>

          <div className="w-full max-w-xs mb-8">
            <p className="text-sm text-[var(--nanny-gray)] mb-3 text-center">&iquest;Cu&aacute;l es tu rol?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setParentRole('mama')}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition-all ${
                  parentRole === 'mama'
                    ? 'border-[var(--nanny-purple)] bg-[var(--nanny-purple-bg)]'
                    : 'border-gray-200'
                }`}
              >
                <span className="text-2xl">👩</span>
                <span className="text-sm font-medium">Mam&aacute;</span>
              </button>
              <button
                onClick={() => setParentRole('papa')}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition-all ${
                  parentRole === 'papa'
                    ? 'border-[var(--nanny-purple)] bg-[var(--nanny-purple-bg)]'
                    : 'border-gray-200'
                }`}
              >
                <span className="text-2xl">👨</span>
                <span className="text-sm font-medium">Pap&aacute;</span>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--nanny-red)] text-center mb-3">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            {saving ? 'Creando familia...' : 'Crear familia'} {!saving && <ArrowRight size={16} />}
          </button>
        </div>
      )}

      {/* STEP 3: WOW moment — mini demo interactivo */}
      {step === 'wow' && (
        <div className="flex flex-col items-center px-6 pt-8 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-[var(--nanny-purple)] flex items-center justify-center mb-4">
            <Bot size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Hola, soy Nanny</h1>
          <p className="text-xs text-[var(--nanny-gray)] mb-6 max-w-[280px] text-center">
            Mira c&oacute;mo funciono &mdash; escr&iacute;beme como le hablar&iacute;as a tu pareja:
          </p>

          {/* Mini chat demo */}
          <div className="w-full max-w-xs bg-[var(--nanny-gray-light)] rounded-2xl p-4 mb-6 min-h-[140px]">
            <div className="space-y-3">
              {demoSteps.slice(0, demoStep).map((d, i) => (
                <div key={i} className={`flex ${d.sender === 'parent' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    d.sender === 'parent'
                      ? 'bg-[var(--nanny-purple)] text-white rounded-br-md'
                      : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
                  }`}>
                    {d.text}
                  </div>
                </div>
              ))}
              {demoStep < demoSteps.length && demoStep > 0 && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-white rounded-2xl px-3.5 py-2.5 shadow-sm rounded-bl-md">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--nanny-purple)] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Children created */}
          {createdChildren.length > 0 && (
            <div className="bg-[var(--nanny-purple-bg)] rounded-2xl p-4 mb-6 w-full max-w-xs">
              <p className="text-sm text-[var(--nanny-purple)] font-medium mb-2">Ya conozco a:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {createdChildren.map((c, i) => (
                  <span key={i} className="bg-white rounded-full px-3 py-1.5 text-sm">
                    {c.emoji} {c.name} &mdash; {c.age} a&ntilde;os
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { window.location.href = '/chat'; }}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm"
          >
            Ir al chat <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
