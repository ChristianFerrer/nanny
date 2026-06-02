'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { getParents, updateParent } from '@/lib/store';
import type { Parent } from '@/lib/types';
import DetailHeader from '@/components/DetailHeader';

export default function EditarPadrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'mama' | 'papa'>('mama');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const ps = await getParents();
      const found = ps.find(x => x.id === id);
      if (!found) {
        setNotFound(true);
      } else {
        setParent(found);
        setName(found.name);
        setPhone(found.phone || '');
        setEmail(found.email || '');
        setRole(found.role);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Navegación con flechas para el radiogroup de rol (sin librerías).
  const onRoleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const options: ('mama' | 'papa')[] = ['mama', 'papa'];
    const idx = options.indexOf(role);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (idx + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (idx - 1 + options.length) % options.length;
    } else {
      return;
    }
    e.preventDefault();
    const nextRole = options[next];
    setRole(nextRole);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  const handleSave = async () => {
    if (!parent) return;
    setSaving(true);
    await updateParent(parent.id, {
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      role,
      avatar_emoji: role,
    });
    setSaving(false);
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton h-9 w-9 rounded-full mb-3" />
          <div className="skeleton h-7 w-48" />
        </header>
        <div className="px-5 space-y-4">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !parent) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter px-5 pt-header">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight mb-4"
        >
          <ArrowLeft size={26} />
        </button>
        <p className="text-headline">No encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <DetailHeader title={<>Editar {role === 'mama' ? 'mamá' : 'papá'}</>} subtitle={name} />

      <div className="px-5 mt-4 space-y-4">
        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Rol</label>
          <div
            role="radiogroup"
            aria-label="Rol del padre/madre"
            className="flex gap-2"
            onKeyDown={onRoleKeyDown}
          >
            <button
              role="radio"
              aria-checked={role === 'mama'}
              tabIndex={role === 'mama' ? 0 : -1}
              onClick={() => setRole('mama')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-subhead font-semibold transition-colors ${
                role === 'mama' ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]' : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
              }`}
            >
              Mamá
            </button>
            <button
              role="radio"
              aria-checked={role === 'papa'}
              tabIndex={role === 'papa' ? 0 : -1}
              onClick={() => setRole('papa')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-subhead font-semibold transition-colors ${
                role === 'papa' ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]' : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
              }`}
            >
              Papá
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="padre-nombre" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Nombre</label>
          <input id="padre-nombre" type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <label htmlFor="padre-telefono" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Teléfono</label>
          <input
            id="padre-telefono"
            type="tel"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            placeholder="Opcional"
            inputMode="tel"
          />
        </div>

        <div>
          <label htmlFor="padre-email" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Email</label>
          <input id="padre-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Opcional" />
        </div>

        <button onClick={handleSave} disabled={saving || !name.trim()} className="btn btn-primary btn-block">
          <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function formatPhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    const rest = digits.slice(1).replace(/\D/g, '');
    const cc = rest.slice(0, 2);
    const a = rest.slice(2, 4);
    const b = rest.slice(4, 8);
    const c = rest.slice(8, 12);
    return ['+' + cc, a, b, c].filter(Boolean).join(' ');
  }
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 10);
  return [a, b, c].filter(Boolean).join(' ');
}
