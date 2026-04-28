'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Heart, BookOpen, Calendar, Activity, Clock, GraduationCap, Stethoscope, Cake, Trophy, Plane, MapPin, ClipboardList, AlertTriangle, Sparkles, CheckCircle2, CheckSquare, Sunrise, Sun, Moon, Pencil, Plus, Pill, ChevronRight } from 'lucide-react';
import { getChild, getRoutines, getEvents, getTasks, getMedications } from '@/lib/store';
import type { Child, Routine, FamilyEvent, Task, Medication } from '@/lib/types';
import { formatAge } from '@/lib/age';

type TabId = 'identidad' | 'operativo' | 'salud' | 'rutinas';

export default function HijoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [child, setChild] = useState<Child | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('identidad');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const id = params.id as string;
    try {
      const [c, r, e, t, m] = await Promise.all([
        getChild(id), getRoutines(id), getEvents(), getTasks(), getMedications(),
      ]);
      setChild(c);
      setRoutines(r);
      setEvents(e.filter(ev => ev.child_id === id));
      setTasks(t.filter(tk => tk.child_id === id));
      setMedications(m.filter(med => med.child_id === id));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-4 pt-header pb-6">
          <div className="skeleton h-8 w-8 rounded-full mb-4" />
          <div className="flex items-center gap-4">
            <div className="skeleton w-20 h-20 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-7 w-32 mb-2" />
              <div className="skeleton h-4 w-20" />
            </div>
          </div>
        </div>
        <div className="px-4 space-y-3">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-[var(--text-tertiary)] px-6 text-center">
        <p className="text-headline mb-2">No encontramos este perfil</p>
        <button onClick={() => router.back()} className="btn btn-tinted btn-sm mt-2">Volver</button>
      </div>
    );
  }

  const age = child.birth_date ? formatAge(child.birth_date) : null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'identidad', label: 'Info' },
    { id: 'operativo', label: 'Agenda' },
    { id: 'salud', label: 'Salud' },
    { id: 'rutinas', label: 'Rutinas' },
  ];

  return (
    <div className="min-h-screen bg-white page-enter">
      {/* Header limpio Apple-style */}
      <header className="px-4 pt-header pb-5">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.back()}
            aria-label="Volver"
            className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ArrowLeft size={26} />
          </button>
          <Link
            href={`/perfil/hijo/${child.id}`}
            className="btn btn-tinted btn-sm"
            aria-label="Editar perfil"
          >
            <Pencil size={14} /> Editar
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-large-title font-semibold text-white shadow-sm shrink-0"
            style={{ background: child.color || 'var(--nanny-purple)' }}
          >
            {child.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-title-1 text-[var(--text-primary)] truncate">{child.name}</h1>
            {age !== null && <p className="text-subhead text-[var(--text-secondary)]">{age}</p>}
            {child.school && (
              <p className="text-footnote text-[var(--text-tertiary)] mt-0.5 inline-flex items-center gap-1 truncate">
                <GraduationCap size={12} /> {child.school}
              </p>
            )}
            {child.grade && (
              <p className="text-footnote text-[var(--text-tertiary)] inline-flex items-center gap-1 truncate">
                <BookOpen size={12} /> {child.grade}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Segmented control tabs (Apple-style) */}
      <div className="sticky top-0 z-10 glass px-4 py-2.5">
        <div role="tablist" className="bg-[var(--gray-100)] p-1 rounded-xl flex gap-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-subhead font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 pb-24">
        {activeTab === 'identidad' && <IdentidadTab child={child} />}
        {activeTab === 'operativo' && <OperativoTab events={events} tasks={tasks} childId={child.id} />}
        {activeTab === 'salud' && <SaludTab child={child} medications={medications} />}
        {activeTab === 'rutinas' && <RutinasTab routines={routines} childId={child.id} />}
      </div>
    </div>
  );
}

function IdentidadTab({ child }: { child: Child }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <Card title="Información básica" icon={<ClipboardList size={16} className="text-[var(--nanny-purple)]" />}>
        <InfoRow label="Nombre" value={child.name} />
        {child.birth_date && (
          <InfoRow label="Nacimiento" value={new Date(child.birth_date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} />
        )}
        {child.school && <InfoRow label="Colegio" value={child.school} />}
        {child.teacher && <InfoRow label="Maestra" value={child.teacher} />}
        {child.grade && <InfoRow label="Grado" value={child.grade} />}
      </Card>

      {child.personality_notes && (
        <Card title="Personalidad" icon={<Sparkles size={16} className="text-amber-500" />}>
          <p className="text-subhead text-[var(--text-primary)]">{child.personality_notes}</p>
        </Card>
      )}
    </div>
  );
}

function SaludTab({ child, medications }: { child: Child; medications: Medication[] }) {
  const [nowMs] = useState(() => Date.now());
  const activeMeds = medications.filter(m => m.status === 'active');
  return (
    <div className="space-y-4 animate-fade-in">
      <Card title="Tratamientos activos" icon={<Pill size={16} className="text-[var(--nanny-purple)]" />}>
        {activeMeds.length === 0 ? (
          <p className="text-footnote text-[var(--text-tertiary)]">Sin tratamientos activos</p>
        ) : (
          <div className="space-y-1">
            {activeMeds.map(m => {
              const start = new Date(m.start_date);
              const totalDays = m.duration_days || 1;
              const daysPassed = Math.max(0, Math.floor((nowMs - start.getTime()) / (1000 * 60 * 60 * 24)));
              const daysLeft = Math.max(0, totalDays - daysPassed);
              return (
                <Link
                  key={m.id}
                  href={`/tratamiento/${m.id}`}
                  className="flex items-center gap-3 py-2 -mx-1 px-1 rounded-lg tap-highlight focus-ring"
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--nanny-purple-tint)' }}>
                    <Pill size={14} className="text-[var(--nanny-purple)]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-[var(--text-primary)] truncate">{m.medication_name}</p>
                    <p className="text-footnote text-[var(--text-tertiary)] truncate">
                      {m.frequency || ''}{m.schedule_times?.length ? ` · ${m.schedule_times.join(', ')}` : ''}
                    </p>
                  </div>
                  <span className="text-caption-2 text-[var(--text-tertiary)] whitespace-nowrap">
                    {daysLeft === 0 ? 'Último día' : `${daysLeft}d`}
                  </span>
                  <ChevronRight size={14} className="text-[var(--text-quaternary)]" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Alergias y condiciones" icon={<Stethoscope size={16} className="text-[var(--text-secondary)]" />}>
        {child.allergies && child.allergies.length > 0 ? (
          <div>
            <p className="text-caption text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Alergias</p>
            <div className="flex gap-1.5 flex-wrap">
              {child.allergies.map((a, i) => {
                const isSevere = /\b(severa?|grave|anafil|emergencia|epi|pen)\b/i.test(a);
                return (
                  <span
                    key={i}
                    className={`badge ${isSevere ? 'badge-danger' : 'badge-neutral'}`}
                  >
                    {isSevere && <AlertTriangle size={10} />} {a}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-footnote text-[var(--text-tertiary)]">Sin alergias registradas</p>
        )}
        {child.medical_notes && (
          <div className="mt-3">
            <p className="text-caption text-[var(--text-tertiary)] mb-1 uppercase tracking-wider">Notas médicas</p>
            <p className="text-subhead text-[var(--text-primary)]">{child.medical_notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function OperativoTab({ events, tasks, childId }: { events: FamilyEvent[]; tasks: Task[]; childId: string }) {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const typeIcons: Record<string, { icon: React.ReactNode; bg: string }> = {
    doctor: { icon: <Stethoscope size={14} className="text-red-500" />, bg: 'bg-red-50' },
    school: { icon: <GraduationCap size={14} className="text-blue-500" />, bg: 'bg-blue-50' },
    birthday: { icon: <Cake size={14} className="text-pink-500" />, bg: 'bg-pink-50' },
    activity: { icon: <Trophy size={14} className="text-green-500" />, bg: 'bg-green-50' },
    travel: { icon: <Plane size={14} className="text-purple-500" />, bg: 'bg-purple-50' },
    other: { icon: <MapPin size={14} className="text-gray-500" />, bg: 'bg-gray-50' },
  };

  const eventsToShow = showAllEvents ? events : events.slice(0, 5);

  return (
    <div className="space-y-4 animate-fade-in">
      <Card title={`Eventos (${events.length})`} icon={<Calendar size={16} className="text-[var(--nanny-purple)]" />}>
        {events.length === 0 ? (
          <p className="text-footnote text-[var(--text-tertiary)]">Sin eventos próximos</p>
        ) : (
          <>
            <div className="space-y-2">
              {eventsToShow.map(e => {
                const ti = typeIcons[e.event_type] || typeIcons.other;
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1">
                    <span className={`w-9 h-9 rounded-xl ${ti.bg} flex items-center justify-center shrink-0`}>{ti.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-subhead text-[var(--text-primary)] truncate">{e.title}</p>
                      <p className="text-footnote text-[var(--text-tertiary)]">
                        {new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className={`badge ${e.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                      {e.status === 'confirmed' ? <><CheckCircle2 size={10} /> Conf.</> : <><Clock size={10} /> Pend.</>}
                    </span>
                  </div>
                );
              })}
            </div>
            {events.length > 5 && (
              <button
                onClick={() => setShowAllEvents(v => !v)}
                className="mt-3 w-full text-center text-footnote text-[var(--nanny-purple)] font-semibold py-2 rounded-lg hover:bg-[var(--nanny-purple-tint)] transition-colors"
              >
                {showAllEvents ? 'Mostrar menos' : `Ver agenda completa (${events.length}) →`}
              </button>
            )}
            {!showAllEvents && events.length > 5 && (
              <Link
                href={`/semana?child=${childId}`}
                className="block mt-1 text-center text-caption text-[var(--text-tertiary)]"
              >
                Ir a la vista de semana
              </Link>
            )}
          </>
        )}
      </Card>

      <Card title={`Tareas pendientes (${tasks.length})`} icon={<CheckSquare size={16} className="text-amber-500" />}>
        {tasks.length === 0 ? (
          <p className="text-footnote text-[var(--text-tertiary)]">Sin tareas pendientes</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  t.priority === 'high' || t.priority === 'urgent' ? 'bg-[var(--warning)]' : 'bg-[var(--info)]'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-subhead text-[var(--text-primary)] truncate">{t.title}</p>
                  {t.due_date && (
                    <p className="text-footnote text-[var(--text-tertiary)]">
                      Vence {new Date(t.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RutinasTab({ routines, childId }: { routines: Routine[]; childId: string }) {
  // Agrupar por momento del día según time_start (no por la columna `type`,
  // que puede ser school/activity/meal/... y no se mapea 1:1 a momento).
  // Las rutinas sin time_start van al final como "Todo el día".
  const dayShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const bucket = (r: Routine): 'morning' | 'afternoon' | 'night' | 'untimed' => {
    if (!r.time_start) return 'untimed';
    const h = parseInt(r.time_start.slice(0, 2), 10);
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'night';
  };

  const grouped = {
    morning: routines.filter(r => bucket(r) === 'morning').sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '')),
    afternoon: routines.filter(r => bucket(r) === 'afternoon').sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '')),
    night: routines.filter(r => bucket(r) === 'night').sort((a, b) => (a.time_start || '').localeCompare(b.time_start || '')),
    untimed: routines.filter(r => bucket(r) === 'untimed'),
  };

  const sections = [
    { key: 'morning' as const, title: 'Mañana', icon: <Sunrise size={16} className="text-amber-500" />, items: grouped.morning },
    { key: 'afternoon' as const, title: 'Tarde', icon: <Sun size={16} className="text-orange-500" />, items: grouped.afternoon },
    { key: 'night' as const, title: 'Noche', icon: <Moon size={16} className="text-indigo-500" />, items: grouped.night },
    { key: 'untimed' as const, title: 'Sin horario', icon: <Clock size={16} className="text-gray-500" />, items: grouped.untimed },
  ];

  const formatDays = (dow: number[]): string => {
    if (dow.length === 7) return 'Todos los días';
    const sorted = [...dow].sort();
    if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return 'Lun-Vie';
    if (sorted.length === 2 && sorted.join(',') === '0,6') return 'Fin de semana';
    return sorted.map(d => dayShort[d]).join(', ');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {sections.map(section => (
        section.items.length > 0 && (
          <Card key={section.key} title={section.title} icon={section.icon}>
            <div className="space-y-2">
              {section.items.map(routine => (
                <div key={routine.id} className="flex items-center gap-3 py-1.5">
                  <div className="text-footnote text-[var(--nanny-purple)] font-mono w-14 shrink-0">
                    {routine.time_start ? routine.time_start.slice(0, 5) : '--:--'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-[var(--text-primary)] truncate">{routine.name}</p>
                    <p className="text-footnote text-[var(--text-tertiary)] truncate">
                      {formatDays(routine.days_of_week)}
                      {routine.time_end ? ` · hasta ${routine.time_end.slice(0, 5)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ))}

      <Link
        href={`/hijo/${childId}/rutina/nueva`}
        className="block w-full card-flat text-[var(--nanny-purple)] text-subhead font-semibold py-4 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
      >
        <Plus size={16} /> Agregar rutina
      </Link>

      {routines.length === 0 && (
        <div className="card-flat text-center py-8 px-5">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-3">
            <BookOpen size={22} className="text-[var(--nanny-purple)]" />
          </div>
          <p className="text-subhead text-[var(--text-primary)]">Sin rutinas todavía</p>
          <p className="text-footnote text-[var(--text-tertiary)] mt-1">Agrega una desde el botón de arriba o decile a Nanny en el chat.</p>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-headline text-[var(--text-primary)] mb-3 flex items-center gap-2">{icon}{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-[var(--separator)] last:border-0">
      <span className="text-footnote text-[var(--text-tertiary)]">{label}</span>
      <span className="text-subhead text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

