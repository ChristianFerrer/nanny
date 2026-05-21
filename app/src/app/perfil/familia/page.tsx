'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { getFamily, updateFamily } from '@/lib/store';
import type { Family } from '@/lib/types';
import DetailHeader from '@/components/DetailHeader';

const TIMEZONE_OPTIONS: { tz: string; label: string }[] = [
  { tz: 'America/Argentina/Buenos_Aires', label: 'Argentina (GMT-3)' },
  { tz: 'America/Mexico_City', label: 'México CDMX (GMT-6)' },
  { tz: 'America/Bogota', label: 'Colombia (GMT-5)' },
  { tz: 'America/Lima', label: 'Perú (GMT-5)' },
  { tz: 'America/Santiago', label: 'Chile (GMT-3 / -4)' },
  { tz: 'America/Montevideo', label: 'Uruguay (GMT-3)' },
  { tz: 'America/Caracas', label: 'Venezuela (GMT-4)' },
  { tz: 'America/Guayaquil', label: 'Ecuador (GMT-5)' },
  { tz: 'America/La_Paz', label: 'Bolivia (GMT-4)' },
  { tz: 'America/Asuncion', label: 'Paraguay (GMT-3 / -4)' },
  { tz: 'America/Tegucigalpa', label: 'Honduras (GMT-6)' },
  { tz: 'America/Guatemala', label: 'Guatemala (GMT-6)' },
  { tz: 'America/El_Salvador', label: 'El Salvador (GMT-6)' },
  { tz: 'America/Costa_Rica', label: 'Costa Rica (GMT-6)' },
  { tz: 'America/Panama', label: 'Panamá (GMT-5)' },
  { tz: 'America/Santo_Domingo', label: 'República Dominicana (GMT-4)' },
  { tz: 'America/Havana', label: 'Cuba (GMT-5)' },
  { tz: 'America/New_York', label: 'EE.UU. Este (GMT-5)' },
  { tz: 'America/Los_Angeles', label: 'EE.UU. Pacífico (GMT-8)' },
  { tz: 'Europe/Madrid', label: 'España (GMT+1)' },
];

export default function EditarFamiliaPage() {
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const f = await getFamily();
      if (f) {
        setFamily(f);
        setName(f.name);
        setTimezone(f.timezone || 'America/Argentina/Buenos_Aires');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    await updateFamily({
      name: name.trim(),
      timezone,
      timezone_set_manually: true,
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

  if (!family) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter px-5 pt-header">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight mb-4"
        >
          <ArrowLeft size={26} />
        </button>
        <p className="text-headline">Familia no encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <DetailHeader title="Editar familia" subtitle="Nombre y zona horaria" />

      <div className="px-5 mt-4 space-y-4">
        <div>
          <label htmlFor="familia-nombre" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Nombre de la familia</label>
          <input id="familia-nombre" type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <label htmlFor="familia-timezone" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Zona horaria</label>
          <select id="familia-timezone" value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full">
            {TIMEZONE_OPTIONS.map(({ tz, label }) => (
              <option key={tz} value={tz}>{label}</option>
            ))}
          </select>
          <p className="text-caption-2 text-pretty text-[var(--text-tertiary)] mt-1.5">
            Se usa para enviar el resumen matutino a las 8 AM hora local.
          </p>
        </div>

        <button onClick={handleSave} disabled={saving || !name.trim()} className="btn btn-primary btn-block">
          <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
