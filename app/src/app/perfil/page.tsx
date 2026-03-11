'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Save, Plus, X, ChevronRight, Baby, Users2, Home } from 'lucide-react';
import { getFamily, getParents, getChildren, updateFamily, updateParent, updateChild, addChild as addChildStore, resetFamilyCache } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import type { Family, Parent, Child } from '@/lib/types';

const CHILD_EMOJIS = ['🧒', '👧', '👦', '👶', '🧒🏻', '👧🏽', '👦🏾', '👶🏻'];

type EditSection = null | 'family' | 'parent' | 'child' | 'newChild';

export default function PerfilPage() {
  const router = useRouter();
  const [family, setFamily] = useState<Family | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editId, setEditId] = useState<string>('');
  const [loggingOut, setLoggingOut] = useState(false);

  // Edit state
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childEmoji, setChildEmoji] = useState('🧒');
  const [childSchool, setChildSchool] = useState('');
  const [childTeacher, setChildTeacher] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childAllergies, setChildAllergies] = useState('');
  const [childMedicalNotes, setChildMedicalNotes] = useState('');
  const [childPersonalityNotes, setChildPersonalityNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [f, p, c] = await Promise.all([getFamily(), getParents(), getChildren()]);
      if (!f) {
        setLoadError(true);
        return;
      }
      setFamily(f);
      setParents(p);
      setChildren(c);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (loadError) {
      router.replace('/login');
    }
  }, [loadError, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = getSupabase();
    await supabase.auth.signOut();
    resetFamilyCache();
    window.location.href = '/login';
  };

  const openEditFamily = () => {
    if (!family) return;
    setFamilyName(family.name);
    setEditSection('family');
  };

  const openEditParent = (p: Parent) => {
    setEditId(p.id);
    setParentName(p.name);
    setParentPhone(p.phone || '');
    setParentEmail(p.email || '');
    setEditSection('parent');
  };

  const openEditChild = (c: Child) => {
    setEditId(c.id);
    setChildName(c.name);
    setChildBirthDate(c.birth_date || '');
    setChildEmoji(c.emoji);
    setChildSchool(c.school || '');
    setChildTeacher(c.teacher || '');
    setChildGrade(c.grade || '');
    setChildAllergies(c.allergies?.join(', ') || '');
    setChildMedicalNotes(c.medical_notes || '');
    setChildPersonalityNotes(c.personality_notes || '');
    setEditSection('child');
  };

  const openAddChild = () => {
    setChildName('');
    setChildBirthDate('');
    setChildEmoji('🧒');
    setChildSchool('');
    setChildTeacher('');
    setChildGrade('');
    setChildAllergies('');
    setChildMedicalNotes('');
    setChildPersonalityNotes('');
    setEditSection('newChild');
  };

  const saveFamily = async () => {
    setSaving(true);
    await updateFamily({ name: familyName });
    await loadData();
    setEditSection(null);
    setSaving(false);
  };

  const saveParent = async () => {
    setSaving(true);
    await updateParent(editId, {
      name: parentName,
      phone: parentPhone || null,
      email: parentEmail || null,
    });
    await loadData();
    setEditSection(null);
    setSaving(false);
  };

  const saveChild = async () => {
    setSaving(true);
    const data = {
      name: childName,
      birth_date: childBirthDate || null,
      emoji: childEmoji,
      school: childSchool || null,
      teacher: childTeacher || null,
      grade: childGrade || null,
      allergies: childAllergies ? childAllergies.split(',').map(a => a.trim()).filter(Boolean) : [],
      medical_notes: childMedicalNotes || null,
      personality_notes: childPersonalityNotes || null,
    };
    await updateChild(editId, data);
    await loadData();
    setEditSection(null);
    setSaving(false);
  };

  const saveNewChild = async () => {
    if (!family) return;
    setSaving(true);
    await addChildStore({
      family_id: family.id,
      name: childName,
      birth_date: childBirthDate || null,
      emoji: childEmoji,
      school: childSchool || null,
      teacher: childTeacher || null,
      grade: childGrade || null,
      allergies: childAllergies ? childAllergies.split(',').map(a => a.trim()).filter(Boolean) : [],
      medical_notes: childMedicalNotes || null,
      personality_notes: childPersonalityNotes || null,
    });
    await loadData();
    setEditSection(null);
    setSaving(false);
  };

  if (!family) return (
    <div className="flex items-center justify-center h-screen text-[var(--nanny-gray)]">Cargando...</div>
  );

  // Modal overlay for editing
  if (editSection) {
    return (
      <div className="min-h-screen bg-white animate-fade-in">
        <div className="px-5 pt-12 pb-8">
          <button onClick={() => setEditSection(null)} className="mb-4 text-[var(--nanny-gray)]">
            <X size={20} />
          </button>

          {editSection === 'family' && (
            <>
              <h1 className="text-xl font-bold mb-4">Editar familia</h1>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Nombre de la familia</label>
                  <input type="text" value={familyName} onChange={e => setFamilyName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                <button onClick={saveFamily} disabled={saving || !familyName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40">
                  <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          )}

          {editSection === 'parent' && (
            <>
              <h1 className="text-xl font-bold mb-4">Editar padre/madre</h1>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Nombre</label>
                  <input type="text" value={parentName} onChange={e => setParentName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Teléfono</label>
                  <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Email</label>
                  <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                <button onClick={saveParent} disabled={saving || !parentName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40">
                  <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          )}

          {(editSection === 'child' || editSection === 'newChild') && (
            <>
              <h1 className="text-xl font-bold mb-4">
                {editSection === 'newChild' ? 'Agregar hijo' : 'Editar hijo'}
              </h1>
              <div className="space-y-3">
                <div className="flex gap-1.5 mb-1">
                  {CHILD_EMOJIS.slice(0, 6).map(emoji => (
                    <button key={emoji} onClick={() => setChildEmoji(emoji)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
                        childEmoji === emoji ? 'bg-[var(--nanny-purple)] ring-2 ring-[var(--nanny-purple)]' : 'bg-[var(--nanny-gray-light)]'
                      }`}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
                  placeholder="Nombre *"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Fecha de nacimiento</label>
                  <input type="date" value={childBirthDate} onChange={e => setChildBirthDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] text-[var(--nanny-gray)]" />
                </div>
                <input type="text" value={childSchool} onChange={e => setChildSchool(e.target.value)}
                  placeholder="Colegio"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                <div className="flex gap-2">
                  <input type="text" value={childTeacher} onChange={e => setChildTeacher(e.target.value)}
                    placeholder="Maestra"
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                  <input type="text" value={childGrade} onChange={e => setChildGrade(e.target.value)}
                    placeholder="Grado"
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                <input type="text" value={childAllergies} onChange={e => setChildAllergies(e.target.value)}
                  placeholder="Alergias (separadas por coma)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                <textarea value={childMedicalNotes} onChange={e => setChildMedicalNotes(e.target.value)}
                  placeholder="Notas médicas"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] resize-none" />
                <textarea value={childPersonalityNotes} onChange={e => setChildPersonalityNotes(e.target.value)}
                  placeholder="Notas de personalidad"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] resize-none" />
                <button
                  onClick={editSection === 'newChild' ? saveNewChild : saveChild}
                  disabled={saving || !childName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40">
                  <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[var(--nanny-purple)] text-white px-5 pt-12 pb-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold">{family.name}</h1>
        <p className="text-sm opacity-80 mt-1">Configuración familiar</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Family section */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Home size={16} className="text-[var(--nanny-purple)]" /> Familia
            </h2>
          </div>
          <button onClick={openEditFamily}
            className="w-full flex items-center justify-between py-2 text-sm text-left">
            <span className="text-[var(--nanny-gray)]">Nombre</span>
            <span className="flex items-center gap-1 font-medium">
              {family.name} <ChevronRight size={14} className="text-[var(--nanny-gray)]" />
            </span>
          </button>
        </section>

        {/* Parents section */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Users2 size={16} className="text-[var(--nanny-purple)]" /> Padres
          </h2>
          {parents.map(p => (
            <button key={p.id} onClick={() => openEditParent(p)}
              className="w-full flex items-center justify-between py-3 border-b border-gray-50 last:border-0 text-left">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.avatar_emoji}</span>
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-[var(--nanny-gray)] capitalize">{p.role}</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-[var(--nanny-gray)]" />
            </button>
          ))}
        </section>

        {/* Children section */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Baby size={16} className="text-[var(--nanny-purple)]" /> Hijos
            </h2>
            <button onClick={openAddChild}
              className="flex items-center gap-1 text-xs text-[var(--nanny-purple)] font-medium">
              <Plus size={14} /> Agregar
            </button>
          </div>
          {children.map(c => {
            const age = c.birth_date ? calcAge(c.birth_date) : null;
            return (
              <button key={c.id} onClick={() => openEditChild(c)}
                className="w-full flex items-center justify-between py-3 border-b border-gray-50 last:border-0 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.emoji}</span>
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-[var(--nanny-gray)]">
                      {age !== null ? `${age} años` : ''}{c.school ? ` · ${c.school}` : ''}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--nanny-gray)]" />
              </button>
            );
          })}
        </section>

        {/* Logout */}
        <button onClick={handleLogout} disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-[var(--nanny-red)] text-[var(--nanny-red)] font-medium text-sm disabled:opacity-40">
          <LogOut size={16} /> {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </button>
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
