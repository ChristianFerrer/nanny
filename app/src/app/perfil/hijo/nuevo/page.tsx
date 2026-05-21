'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { getFamily, getChildren, addChild as addChildStore } from '@/lib/store';
import type { Family } from '@/lib/types';
import DetailHeader from '@/components/DetailHeader';

const CHILD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

export default function NuevoHijoPage() {
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [color, setColor] = useState(CHILD_COLORS[0]);
  const [school, setSchool] = useState('');
  const [teacher, setTeacher] = useState('');
  const [grade, setGrade] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [personalityNotes, setPersonalityNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [f, cs] = await Promise.all([getFamily(), getChildren()]);
      setFamily(f);
      setColor(CHILD_COLORS[cs.length % CHILD_COLORS.length]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!family) return;
    setSaving(true);
    await addChildStore({
      family_id: family.id,
      name: name.trim(),
      birth_date: birthDate || null,
      emoji: '👶',
      color,
      school: school || null,
      teacher: teacher || null,
      grade: grade || null,
      allergies: allergies ? allergies.split(',').map(a => a.trim()).filter(Boolean) : [],
      medical_notes: medicalNotes || null,
      personality_notes: personalityNotes || null,
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
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <DetailHeader title="Agregar hijo" />

      <div className="px-5 mt-4 space-y-4">
        <div>
          <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Color</label>
          <div className="flex gap-2">
            {CHILD_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={`size-10 rounded-full transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-[var(--text-primary)] scale-110' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" aria-label="Nombre" />

        <div>
          <label htmlFor="hijo-fecha-nacimiento" className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Fecha de nacimiento</label>
          <input id="hijo-fecha-nacimiento" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </div>

        <input type="text" value={school} onChange={e => setSchool(e.target.value)} placeholder="Colegio" aria-label="Colegio" />

        <div className="flex gap-2">
          <input type="text" value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="Maestra" aria-label="Maestra" />
          <input type="text" value={grade} onChange={e => setGrade(e.target.value)} placeholder="Grado" aria-label="Grado" />
        </div>

        <input type="text" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Alergias (separadas por coma)" aria-label="Alergias (separadas por coma)" />
        <textarea value={medicalNotes} onChange={e => setMedicalNotes(e.target.value)} placeholder="Notas médicas" rows={2} aria-label="Notas médicas" />
        <textarea value={personalityNotes} onChange={e => setPersonalityNotes(e.target.value)} placeholder="Notas de personalidad" rows={2} aria-label="Notas de personalidad" />

        <button onClick={handleSave} disabled={saving || !name.trim()} className="btn btn-primary btn-block">
          <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
