'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, ArrowRight, ArrowLeft, Heart, Plus, X } from 'lucide-react';

type Step = 'welcome' | 'parents' | 'children' | 'done';

interface ParentForm {
  name: string;
  role: 'mama' | 'papa';
  avatar_emoji: string;
}

interface ChildForm {
  name: string;
  birth_date: string;
  emoji: string;
  school: string;
  teacher: string;
  grade: string;
  allergies: string;
}

const CHILD_EMOJIS = ['🧒', '👧', '👦', '👶', '🧒🏻', '👧🏽', '👦🏾', '👶🏻'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [familyName, setFamilyName] = useState('');
  const [parents, setParents] = useState<ParentForm[]>([
    { name: '', role: 'mama', avatar_emoji: '👩' },
    { name: '', role: 'papa', avatar_emoji: '👨' },
  ]);
  const [children, setChildren] = useState<ChildForm[]>([
    { name: '', birth_date: '', emoji: '🧒', school: '', teacher: '', grade: '', allergies: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addChild = () => {
    const nextEmoji = CHILD_EMOJIS[children.length % CHILD_EMOJIS.length];
    setChildren([...children, { name: '', birth_date: '', emoji: nextEmoji, school: '', teacher: '', grade: '', allergies: '' }]);
  };

  const removeChild = (index: number) => {
    if (children.length > 1) {
      setChildren(children.filter((_, i) => i !== index));
    }
  };

  const updateChild = (index: number, field: keyof ChildForm, value: string) => {
    setChildren(children.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const updateParent = (index: number, field: keyof ParentForm, value: string) => {
    setParents(parents.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyName: familyName || `Familia ${parents[0]?.name || 'Nueva'}`,
          parents: parents.filter(p => p.name.trim()),
          children: children.filter(c => c.name.trim()).map(c => ({
            ...c,
            allergies: c.allergies ? c.allergies.split(',').map(a => a.trim()).filter(Boolean) : [],
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar. Verifica tu conexión.');
    }
    setSaving(false);
  };

  return (
    <div className="min-h-[100dvh] bg-white">
      {step === 'welcome' && (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center mb-6">
            <Baby size={48} className="text-[var(--nanny-purple)]" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Hola! Soy Nanny</h1>
          <p className="text-[var(--nanny-gray)] mb-8 max-w-xs">
            Tu asistente inteligente para coordinar la crianza en familia. Vamos a configurar tu cuenta.
          </p>

          <div className="w-full max-w-xs mb-4">
            <label className="text-xs text-[var(--nanny-gray)] mb-1 block text-left">
              Nombre de tu familia (opcional)
            </label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ej: Familia García"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none"
            />
          </div>

          <button
            onClick={() => setStep('parents')}
            className="w-full max-w-xs flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm"
          >
            Empezar <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 'parents' && (
        <div className="px-5 pt-12 pb-8 animate-fade-in">
          <button onClick={() => setStep('welcome')} className="mb-4 text-[var(--nanny-gray)]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold mb-1">Los padres</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-6">¿Quiénes coordinan la crianza?</p>

          {parents.map((parent, i) => (
            <div key={i} className="mb-6 bg-[var(--nanny-gray-light)] rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{parent.avatar_emoji}</span>
                <div className="flex-1">
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => updateParent(i, 'role', 'mama')}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        parent.role === 'mama'
                          ? 'bg-[var(--nanny-purple)] text-white'
                          : 'bg-white text-[var(--nanny-gray)]'
                      }`}
                    >
                      👩 Mamá
                    </button>
                    <button
                      onClick={() => {
                        updateParent(i, 'role', 'papa');
                        updateParent(i, 'avatar_emoji', '👨');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        parent.role === 'papa'
                          ? 'bg-[var(--nanny-purple)] text-white'
                          : 'bg-white text-[var(--nanny-gray)]'
                      }`}
                    >
                      👨 Papá
                    </button>
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={parent.name}
                onChange={(e) => updateParent(i, 'name', e.target.value)}
                placeholder={parent.role === 'mama' ? 'Nombre de mamá' : 'Nombre de papá'}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[var(--nanny-purple-light)] outline-none bg-white"
              />
            </div>
          ))}

          <button
            onClick={() => setStep('children')}
            disabled={!parents.some(p => p.name.trim())}
            className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 'children' && (
        <div className="px-5 pt-12 pb-8 animate-fade-in">
          <button onClick={() => setStep('parents')} className="mb-4 text-[var(--nanny-gray)]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold mb-1">Los hijos</h1>
          <p className="text-sm text-[var(--nanny-gray)] mb-6">Cuéntame sobre tus hijos</p>

          {children.map((child, i) => (
            <div key={i} className="mb-5 bg-[var(--nanny-gray-light)] rounded-2xl p-4 relative">
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

              <div className="space-y-2">
                <input
                  type="text"
                  value={child.name}
                  onChange={(e) => updateChild(i, 'name', e.target.value)}
                  placeholder="Nombre *"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                />
                <input
                  type="date"
                  value={child.birth_date}
                  onChange={(e) => updateChild(i, 'birth_date', e.target.value)}
                  placeholder="Fecha de nacimiento"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white text-[var(--nanny-gray)]"
                />
                <input
                  type="text"
                  value={child.school}
                  onChange={(e) => updateChild(i, 'school', e.target.value)}
                  placeholder="Colegio (opcional)"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={child.teacher}
                    onChange={(e) => updateChild(i, 'teacher', e.target.value)}
                    placeholder="Maestra"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                  />
                  <input
                    type="text"
                    value={child.grade}
                    onChange={(e) => updateChild(i, 'grade', e.target.value)}
                    placeholder="Grado"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                  />
                </div>
                <input
                  type="text"
                  value={child.allergies}
                  onChange={(e) => updateChild(i, 'allergies', e.target.value)}
                  placeholder="Alergias (separadas por coma)"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addChild}
            className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-[var(--nanny-gray)] mb-4"
          >
            <Plus size={16} /> Agregar otro hijo
          </button>

          {error && (
            <p className="text-sm text-[var(--nanny-red)] text-center mb-3">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={!children.some(c => c.name.trim()) || saving}
            className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Crear mi familia'} {!saving && <Heart size={16} />}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center animate-fade-in">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Familia creada!</h1>
          <p className="text-[var(--nanny-gray)] mb-2 max-w-xs">
            Todo listo. Nanny ya conoce a tu familia y está lista para ayudarles.
          </p>
          <p className="text-sm text-[var(--nanny-gray)] mb-8 max-w-xs">
            Escríbele en el chat como si hablaras con tu pareja — ella detecta eventos, tareas y te ayuda a coordinarse.
          </p>
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
