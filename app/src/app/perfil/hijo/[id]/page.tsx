'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react';
import { getChildren, updateChild, deleteChild as deleteChildStore } from '@/lib/store';
import type { Child } from '@/lib/types';
import DetailHeader from '@/components/DetailHeader';

const CHILD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

export default function EditarHijoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const cs = await getChildren();
      const found = cs.find(x => x.id === id);
      if (!found) {
        setNotFound(true);
      } else {
        setChild(found);
        setName(found.name);
        setBirthDate(found.birth_date || '');
        setColor(found.color || CHILD_COLORS[0]);
        setSchool(found.school || '');
        setTeacher(found.teacher || '');
        setGrade(found.grade || '');
        setAllergies(found.allergies?.join(', ') || '');
        setMedicalNotes(found.medical_notes || '');
        setPersonalityNotes(found.personality_notes || '');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!child) return;
    setSaving(true);
    await updateChild(child.id, {
      name: name.trim(),
      birth_date: birthDate || null,
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

  const handleDelete = async () => {
    if (!child) return;
    setDeleting(true);
    await deleteChildStore(child.id);
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

  if (notFound || !child) {
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
      <DetailHeader title="Editar hijo" subtitle={name} />

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

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn btn-block mt-1"
            style={{ background: 'transparent', color: 'var(--danger)' }}
          >
            <Trash2 size={16} /> Eliminar hijo
          </button>
        ) : (
          <div className="rounded-xl p-3" style={{ background: 'var(--danger-soft)' }}>
            <p className="text-footnote text-pretty text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-[var(--danger)]" />
              Se borrarán también sus rutinas, eventos y tareas asociados. ¿Confirmás?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm flex-1" disabled={deleting}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="btn btn-destructive btn-sm flex-1">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
