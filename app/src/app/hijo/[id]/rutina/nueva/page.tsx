'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { getChildren, addRoutine } from '@/lib/store';
import type { Child } from '@/lib/types';

const DAY_LABELS: { value: number; short: string }[] = [
  { value: 1, short: 'L' },
  { value: 2, short: 'M' },
  { value: 3, short: 'X' },
  { value: 4, short: 'J' },
  { value: 5, short: 'V' },
  { value: 6, short: 'S' },
  { value: 0, short: 'D' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'school', label: 'Cole / guardería' },
  { value: 'activity', label: 'Actividad' },
  { value: 'meal', label: 'Comida' },
  { value: 'morning', label: 'Mañana' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'night', label: 'Noche' },
  { value: 'custom', label: 'Otra' },
];

export default function NuevaRutinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [type, setType] = useState('school');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const cs = await getChildren();
      setChild(cs.find(c => c.id === id) || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  // Navegación con flechas para el radiogroup de tipo (sin librerías).
  const onTypeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = TYPE_OPTIONS.findIndex(o => o.value === type);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (idx + 1) % TYPE_OPTIONS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (idx - 1 + TYPE_OPTIONS.length) % TYPE_OPTIONS.length;
    } else {
      return;
    }
    e.preventDefault();
    setType(TYPE_OPTIONS[next].value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  const handleSave = async () => {
    if (!child) return;
    setSaving(true);
    await addRoutine({
      child_id: child.id,
      type,
      name: name.trim(),
      description: null,
      days_of_week: days,
      time_start: timeStart || null,
      time_end: timeEnd || null,
      active: true,
    });
    setSaving(false);
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton size-9 rounded-full mb-3" />
          <div className="skeleton h-7 w-48" />
        </header>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter px-5 pt-header">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight mb-4"
        >
          <ArrowLeft size={26} />
        </button>
        <p className="text-headline">Hijo no encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-header pb-3">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight"
        >
          <ArrowLeft size={26} />
        </button>
      </header>

      <div className="px-5">
        <h1 className="text-large-title text-[var(--text-primary)] text-balance">Nueva rutina</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">Para {child.name}</p>
      </div>

      <div className="px-5 mt-4 space-y-4">
        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Nombre</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Guardería, Fútbol, Almuerzo" />
        </div>

        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Tipo</label>
          <div
            role="radiogroup"
            aria-label="Tipo de rutina"
            className="flex gap-2 flex-wrap"
            onKeyDown={onTypeKeyDown}
          >
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={type === opt.value}
                tabIndex={type === opt.value ? 0 : -1}
                onClick={() => setType(opt.value)}
                className="px-3 py-1.5 rounded-full text-footnote font-medium transition-colors focus-ring"
                style={{
                  background: type === opt.value ? 'var(--nanny-purple)' : 'var(--gray-100)',
                  color: type === opt.value ? 'white' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Días</label>
          <div role="group" aria-label="Días" className="flex gap-2">
            {DAY_LABELS.map(d => {
              const active = days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(d.value)}
                  className="size-10 rounded-full text-subhead font-semibold focus-ring transition-colors"
                  style={{
                    background: active ? 'var(--nanny-purple)' : 'var(--gray-100)',
                    color: active ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Desde</label>
            <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
          </div>
          <div>
            <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Hasta</label>
            <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || days.length === 0}
          className="btn btn-primary btn-block"
        >
          <Save size={18} /> {saving ? 'Guardando…' : 'Guardar rutina'}
        </button>
      </div>
    </div>
  );
}
