'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Save, Plus, X, ChevronRight, Baby, Users2, Home, Copy, Check, MessageCircle, Share2, User as UserIcon, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getFamily, getParents, getChildren, updateFamily, updateParent, updateChild, addChild as addChildStore, deleteChild as deleteChildStore, resetFamilyCache } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import type { Family, Parent, Child } from '@/lib/types';

const CHILD_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

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

function tzShortLabel(tz: string | null | undefined): string {
  if (!tz) return 'Argentina';
  const found = TIMEZONE_OPTIONS.find(t => t.tz === tz);
  return found ? found.label : tz;
}

type EditSection = null | 'family' | 'parent' | 'child' | 'newChild';

export default function PerfilPage() {
  return (
    <Suspense fallback={<PerfilSkeleton />}>
      <PerfilInner />
    </Suspense>
  );
}

function PerfilSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <header className="px-5 pt-14 pb-5">
        <div className="skeleton h-9 w-48 mb-2" />
        <div className="skeleton h-4 w-32" />
      </header>
      <div className="px-4 space-y-3">
        <div className="skeleton h-20 w-full rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function PerfilInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [family, setFamily] = useState<Family | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editId, setEditId] = useState<string>('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [familyName, setFamilyName] = useState('');
  const [familyTimezone, setFamilyTimezone] = useState('America/Argentina/Buenos_Aires');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentRole, setParentRole] = useState<'mama' | 'papa'>('mama');
  const [parentAvatar, setParentAvatar] = useState('mama');

  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [childColor, setChildColor] = useState(CHILD_COLORS[0]);
  const [childSchool, setChildSchool] = useState('');
  const [childTeacher, setChildTeacher] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childAllergies, setChildAllergies] = useState('');
  const [childMedicalNotes, setChildMedicalNotes] = useState('');
  const [childPersonalityNotes, setChildPersonalityNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Child | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmToast, setConfirmToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setConfirmToast(msg);
    setTimeout(() => setConfirmToast(null), 2400);
  };

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (loadError) router.replace('/login');
  }, [loadError, router]);

  // Query params: ?addChild=1 abre sheet; ?editChild=id abre edit
  useEffect(() => {
    if (!family) return;
    const addChild = searchParams.get('addChild');
    const editChildId = searchParams.get('editChild');
    if (addChild === '1') {
      openAddChild();
      router.replace('/perfil');
    } else if (editChildId) {
      const c = children.find(x => x.id === editChildId);
      if (c) {
        openEditChild(c);
        router.replace('/perfil');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, children]);

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
    setFamilyTimezone(family.timezone || 'America/Argentina/Buenos_Aires');
    setEditSection('family');
  };

  const openEditParent = (p: Parent) => {
    setEditId(p.id);
    setParentName(p.name);
    setParentPhone(p.phone || '');
    setParentEmail(p.email || '');
    setParentRole(p.role);
    setParentAvatar(p.avatar_emoji);
    setEditSection('parent');
  };

  const openEditChild = (c: Child) => {
    setEditId(c.id);
    setChildName(c.name);
    setChildBirthDate(c.birth_date || '');
    setChildColor(c.color || CHILD_COLORS[children.indexOf(c) % CHILD_COLORS.length]);
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
    setChildColor(CHILD_COLORS[children.length % CHILD_COLORS.length]);
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
    await updateFamily({ name: familyName, timezone: familyTimezone });
    await loadData();
    setEditSection(null);
    setSaving(false);
    showToast('Familia actualizada');
  };

  const saveParent = async () => {
    setSaving(true);
    await updateParent(editId, {
      name: parentName,
      phone: parentPhone || null,
      email: parentEmail || null,
      role: parentRole,
      avatar_emoji: parentAvatar,
    });
    await loadData();
    setEditSection(null);
    setSaving(false);
    showToast('Cambios guardados');
  };

  const saveChild = async () => {
    setSaving(true);
    const data = {
      name: childName,
      birth_date: childBirthDate || null,
      color: childColor,
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
    showToast('Cambios guardados');
  };

  const saveNewChild = async () => {
    if (!family) return;
    setSaving(true);
    await addChildStore({
      family_id: family.id,
      name: childName,
      birth_date: childBirthDate || null,
      emoji: '👶',
      color: childColor,
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
    showToast('Hijo agregado');
  };

  const handleDeleteChild = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await deleteChildStore(confirmDelete.id);
    await loadData();
    setDeleting(false);
    setConfirmDelete(null);
    setEditSection(null);
    showToast('Hijo eliminado');
  };

  if (loading || !family) return <PerfilSkeleton />;

  return (
    <div className="min-h-screen bg-white pb-24 page-enter">
      {/* Header limpio Apple */}
      <header className="px-5 pt-14 pb-4">
        <h1 className="text-large-title text-[var(--text-primary)]">{family.name}</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">Configuración familiar</p>
      </header>

      <div className="px-4 space-y-4">
        {/* Familia */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Home size={12} /> Familia
          </h2>
          <div className="list-group">
            <button onClick={openEditFamily} className="list-row w-full focus-ring">
              <span className="text-subhead text-[var(--text-primary)] flex-1 text-left">Nombre</span>
              <span className="text-subhead text-[var(--text-tertiary)]">{family.name}</span>
              <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
            </button>
            <button onClick={openEditFamily} className="list-row w-full focus-ring">
              <span className="text-subhead text-[var(--text-primary)] flex-1 text-left">Zona horaria</span>
              <span className="text-subhead text-[var(--text-tertiary)] truncate max-w-[55%] text-right">
                {tzShortLabel(family.timezone)}
              </span>
              <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
            </button>
          </div>
        </section>

        {/* Padres */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Users2 size={12} /> Padres
          </h2>
          <div className="list-group">
            {parents.map(p => (
              <button key={p.id} onClick={() => openEditParent(p)} className="list-row w-full text-left focus-ring">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${p.role === 'mama' ? 'bg-pink-100' : 'bg-blue-100'}`}>
                  <UserIcon size={18} className={p.role === 'mama' ? 'text-pink-600' : 'text-blue-600'} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-[var(--text-primary)] truncate">{p.name}</p>
                  <p className="text-footnote text-[var(--text-tertiary)]">{p.role === 'mama' ? 'Mamá' : 'Papá'}</p>
                </div>
                <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
              </button>
            ))}
          </div>
        </section>

        {/* Hijos */}
        <section>
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-caption text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
              <Baby size={12} /> Hijos
            </h2>
            <button onClick={openAddChild} className="text-caption text-[var(--nanny-purple)] font-semibold inline-flex items-center gap-1">
              <Plus size={12} /> Agregar
            </button>
          </div>
          <div className="list-group">
            {children.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-footnote text-[var(--text-tertiary)]">Aún no hay hijos. Agrega el primero.</p>
              </div>
            ) : children.map(c => {
              const age = c.birth_date ? calcAge(c.birth_date) : null;
              return (
                <button key={c.id} onClick={() => openEditChild(c)} className="list-row w-full text-left focus-ring">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-headline font-semibold text-white shrink-0"
                    style={{ background: c.color || 'var(--nanny-purple)' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-[var(--text-primary)] truncate">{c.name}</p>
                    <p className="text-footnote text-[var(--text-tertiary)] truncate">
                      {age !== null ? `${age} años` : ''}{c.school ? ` · ${c.school}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Invitar pareja */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-2 uppercase tracking-wider flex items-center gap-1.5">
            <Share2 size={12} /> Invitar pareja
          </h2>
          <div className="card space-y-3">
            <p className="text-footnote text-[var(--text-tertiary)]">
              Comparte el enlace para que tu pareja se una a la familia
            </p>
            <button
              onClick={() => {
                const inviteLink = `${window.location.origin}/login?invite=${family.id}`;
                const msg = `Estoy usando Nanny para organizar las cosas de los niños. Únete aquí: ${inviteLink}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
              }}
              className="btn btn-block"
              style={{ background: '#25D366', color: '#fff' }}
            >
              <MessageCircle size={18} /> Invitar por WhatsApp
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/login?invite=${family.id}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn btn-secondary btn-block"
            >
              {copied ? <><Check size={18} className="text-[var(--success)]" /> Enlace copiado</> : <><Copy size={18} /> Copiar enlace</>}
            </button>
          </div>
        </section>

        {/* Logout */}
        <button
          onClick={() => setConfirmLogout(true)}
          disabled={loggingOut}
          className="btn btn-block mt-2"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          <LogOut size={16} /> {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>

      {/* Bottom sheet de edición */}
      {editSection && (
        <>
          <div className="sheet-backdrop" onClick={() => setEditSection(null)} />
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-handle" />
            <div className="sheet-header flex items-center justify-between">
              <h2 className="text-title-3 text-[var(--text-primary)]">
                {editSection === 'family' && 'Editar familia'}
                {editSection === 'parent' && 'Editar padre/madre'}
                {editSection === 'child' && 'Editar hijo'}
                {editSection === 'newChild' && 'Agregar hijo'}
              </h2>
              <button
                onClick={() => setEditSection(null)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-secondary)] focus-ring"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheet-body space-y-4">
              {editSection === 'family' && (
                <>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Nombre de la familia</label>
                    <input type="text" value={familyName} onChange={e => setFamilyName(e.target.value)} autoFocus />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Zona horaria</label>
                    <select
                      value={familyTimezone}
                      onChange={e => setFamilyTimezone(e.target.value)}
                      className="w-full"
                    >
                      {TIMEZONE_OPTIONS.map(({ tz, label }) => (
                        <option key={tz} value={tz}>{label}</option>
                      ))}
                    </select>
                    <p className="text-caption-2 text-[var(--text-tertiary)] mt-1.5">
                      Se usa para enviar el resumen matutino a las 8 AM hora local.
                    </p>
                  </div>
                  <button onClick={saveFamily} disabled={saving || !familyName.trim()} className="btn btn-primary btn-block">
                    <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </>
              )}

              {editSection === 'parent' && (
                <>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Rol</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setParentRole('mama'); setParentAvatar('mama'); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-subhead font-semibold transition-colors ${
                          parentRole === 'mama' ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]' : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Mamá
                      </button>
                      <button
                        onClick={() => { setParentRole('papa'); setParentAvatar('papa'); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-subhead font-semibold transition-colors ${
                          parentRole === 'papa' ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]' : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Papá
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Nombre</label>
                    <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} autoFocus />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Teléfono</label>
                    <input
                      type="tel"
                      value={parentPhone}
                      onChange={e => setParentPhone(formatPhone(e.target.value))}
                      placeholder="Opcional"
                      inputMode="tel"
                    />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Email</label>
                    <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="Opcional" />
                  </div>
                  <button onClick={saveParent} disabled={saving || !parentName.trim()} className="btn btn-primary btn-block">
                    <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </>
              )}

              {(editSection === 'child' || editSection === 'newChild') && (
                <>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Color</label>
                    <div className="flex gap-2">
                      {CHILD_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setChildColor(color)}
                          aria-label={`Color ${color}`}
                          className={`w-10 h-10 rounded-full transition-transform ${
                            childColor === color ? 'ring-2 ring-offset-2 ring-[var(--text-primary)] scale-110' : ''
                          }`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Nombre" autoFocus />
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Fecha de nacimiento</label>
                    <input type="date" value={childBirthDate} onChange={e => setChildBirthDate(e.target.value)} />
                  </div>
                  <input type="text" value={childSchool} onChange={e => setChildSchool(e.target.value)} placeholder="Colegio" />
                  <div className="flex gap-2">
                    <input type="text" value={childTeacher} onChange={e => setChildTeacher(e.target.value)} placeholder="Maestra" />
                    <input type="text" value={childGrade} onChange={e => setChildGrade(e.target.value)} placeholder="Grado" />
                  </div>
                  <input type="text" value={childAllergies} onChange={e => setChildAllergies(e.target.value)} placeholder="Alergias (separadas por coma)" />
                  <textarea value={childMedicalNotes} onChange={e => setChildMedicalNotes(e.target.value)} placeholder="Notas médicas" rows={2} />
                  <textarea value={childPersonalityNotes} onChange={e => setChildPersonalityNotes(e.target.value)} placeholder="Notas de personalidad" rows={2} />
                  <button
                    onClick={editSection === 'newChild' ? saveNewChild : saveChild}
                    disabled={saving || !childName.trim()}
                    className="btn btn-primary btn-block"
                  >
                    <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  {editSection === 'child' && (
                    <button
                      onClick={() => {
                        const c = children.find(x => x.id === editId);
                        if (c) setConfirmDelete(c);
                      }}
                      className="btn btn-block mt-1"
                      style={{ background: 'transparent', color: 'var(--danger)' }}
                    >
                      <Trash2 size={16} /> Eliminar hijo
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirm logout dialog */}
      {confirmLogout && (
        <>
          <div className="sheet-backdrop" onClick={() => setConfirmLogout(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[62] w-[88%] max-w-[340px] bg-[var(--bg-elevated)] rounded-2xl shadow-xl animate-scale-in p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--danger-soft)] flex items-center justify-center mb-3">
              <LogOut size={20} className="text-[var(--danger)]" />
            </div>
            <h3 id="logout-title" className="text-headline text-center text-[var(--text-primary)]">
              ¿Cerrar sesión?
            </h3>
            <p className="text-footnote text-center text-[var(--text-tertiary)] mt-1">
              Tendrás que volver a iniciar sesión para acceder a tu familia.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmLogout(false)}
                className="btn btn-secondary flex-1"
                disabled={loggingOut}
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="btn btn-destructive flex-1"
              >
                {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Confirm delete child dialog (doble confirm) */}
      {confirmDelete && (
        <>
          <div className="sheet-backdrop z-[63]" onClick={() => setConfirmDelete(null)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[64] w-[88%] max-w-[340px] bg-[var(--bg-elevated)] rounded-2xl shadow-xl animate-scale-in p-5"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--danger-soft)] flex items-center justify-center mb-3">
              <AlertTriangle size={20} className="text-[var(--danger)]" />
            </div>
            <h3 id="delete-title" className="text-headline text-center text-[var(--text-primary)]">
              ¿Eliminar a {confirmDelete.name}?
            </h3>
            <p className="text-footnote text-center text-[var(--text-tertiary)] mt-1">
              Se borrarán también sus rutinas, eventos y tareas asociados. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary flex-1" disabled={deleting}>
                Cancelar
              </button>
              <button onClick={handleDeleteChild} disabled={deleting} className="btn btn-destructive flex-1">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast de confirmacion */}
      {confirmToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] animate-slide-up" style={{ maxWidth: '380px', width: '90%' }}>
          <div className="flex items-center gap-2 glass-dark rounded-2xl px-4 py-3 shadow-lg">
            <CheckCircle2 size={16} className="text-[var(--success)] shrink-0" />
            <span className="text-subhead text-white flex-1">{confirmToast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPhone(value: string): string {
  // Mexico/LatAm formato: +52 55 1234 5678 o 555 123 4567
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    // International: +XX YY YYYY YYYY
    const rest = digits.slice(1).replace(/\D/g, '');
    const cc = rest.slice(0, 2);
    const a = rest.slice(2, 4);
    const b = rest.slice(4, 8);
    const c = rest.slice(8, 12);
    return ['+' + cc, a, b, c].filter(Boolean).join(' ');
  }
  // Local: XXX XXX XXXX
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 10);
  return [a, b, c].filter(Boolean).join(' ');
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
