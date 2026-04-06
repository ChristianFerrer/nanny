'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Heart, BookOpen, Calendar, Activity, Clock, GraduationCap, Stethoscope, Cake, Trophy, Plane, MapPin, ClipboardList, AlertTriangle, Sparkles, CheckCircle2, CheckSquare, Sunrise, Sun, Moon } from 'lucide-react';
import { getChild, getRoutines, getEvents, getTasks } from '@/lib/store';
import type { Child, Routine, FamilyEvent, Task } from '@/lib/types';

type TabId = 'identidad' | 'operativo' | 'rutinas';

export default function HijoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [child, setChild] = useState<Child | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('identidad');

  const loadData = useCallback(async () => {
    const id = params.id as string;
    const [c, r, e, t] = await Promise.all([
      getChild(id), getRoutines(id), getEvents(), getTasks(),
    ]);
    setChild(c);
    setRoutines(r);
    setEvents(e.filter(ev => ev.child_id === id));
    setTasks(t.filter(tk => tk.child_id === id));
  }, [params.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!child) return (
    <div className="flex items-center justify-center h-screen text-[var(--nanny-gray)]">
      Cargando...
    </div>
  );

  const age = child.birth_date ? calcAge(child.birth_date) : null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'identidad', label: 'Info', icon: <Heart size={14} /> },
    { id: 'operativo', label: 'Agenda', icon: <Activity size={14} /> },
    { id: 'rutinas', label: 'Rutinas', icon: <Clock size={14} /> },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--nanny-purple)] text-white px-4 pt-10 pb-6 rounded-b-3xl">
        <button onClick={() => router.back()} className="mb-3 p-1">
          <ArrowLeft size={22} />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold text-white">
            {child.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{child.name}</h1>
            {age !== null && <p className="text-sm opacity-80">{age} años</p>}
            {child.school && <p className="text-xs opacity-70 mt-0.5 inline-flex items-center gap-1"><GraduationCap size={11} /> {child.school}</p>}
            {child.grade && <p className="text-xs opacity-70 inline-flex items-center gap-1"><BookOpen size={11} /> {child.grade}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-[var(--nanny-bg)] flex px-4 pt-4 pb-2 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--nanny-purple)] text-white'
                : 'bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-4 pb-20">
        {activeTab === 'identidad' && (
          <IdentidadTab child={child} />
        )}
        {activeTab === 'operativo' && (
          <OperativoTab events={events} tasks={tasks} />
        )}
        {activeTab === 'rutinas' && (
          <RutinasTab routines={routines} />
        )}
      </div>
    </div>
  );
}

function IdentidadTab({ child }: { child: Child }) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Basic info */}
      <Card title="Información básica" icon={<ClipboardList size={16} className="text-[var(--nanny-purple)]" />}>
        <InfoRow label="Nombre" value={child.name} />
        {child.birth_date && (
          <InfoRow label="Fecha de nacimiento" value={new Date(child.birth_date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })} />
        )}
        {child.school && <InfoRow label="Colegio" value={child.school} />}
        {child.teacher && <InfoRow label="Maestra" value={child.teacher} />}
        {child.grade && <InfoRow label="Grado" value={child.grade} />}
      </Card>

      {/* Medical */}
      <Card title="Salud" icon={<Stethoscope size={16} className="text-red-500" />}>
        {child.allergies && child.allergies.length > 0 ? (
          <div>
            <p className="text-xs text-[var(--nanny-gray)] mb-1">Alergias</p>
            <div className="flex gap-1 flex-wrap">
              {child.allergies.map((a, i) => (
                <span key={i} className="px-2 py-1 bg-red-50 text-red-600 rounded-full text-xs inline-flex items-center gap-1">
                  <AlertTriangle size={10} className="shrink-0" /> {a}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--nanny-gray)]">Sin alergias registradas</p>
        )}
        {child.medical_notes && (
          <div className="mt-2">
            <p className="text-xs text-[var(--nanny-gray)] mb-1">Notas médicas</p>
            <p className="text-sm">{child.medical_notes}</p>
          </div>
        )}
      </Card>

      {/* Personality */}
      {child.personality_notes && (
        <Card title="Personalidad" icon={<Sparkles size={16} className="text-amber-500" />}>
          <p className="text-sm">{child.personality_notes}</p>
        </Card>
      )}
    </div>
  );
}

function OperativoTab({ events, tasks }: { events: FamilyEvent[]; tasks: Task[] }) {
  const typeIcons: Record<string, { icon: React.ReactNode; bg: string }> = {
    doctor: { icon: <Stethoscope size={14} className="text-red-500" />, bg: 'bg-red-50' },
    school: { icon: <GraduationCap size={14} className="text-blue-500" />, bg: 'bg-blue-50' },
    birthday: { icon: <Cake size={14} className="text-pink-500" />, bg: 'bg-pink-50' },
    activity: { icon: <Trophy size={14} className="text-green-500" />, bg: 'bg-green-50' },
    travel: { icon: <Plane size={14} className="text-purple-500" />, bg: 'bg-purple-50' },
    other: { icon: <MapPin size={14} className="text-gray-500" />, bg: 'bg-gray-50' },
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card title={`Eventos próximos (${events.length})`} icon={<Calendar size={16} className="text-[var(--nanny-purple)]" />}>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--nanny-gray)]">Sin eventos próximos</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 5).map(e => {
              const ti = typeIcons[e.event_type] || typeIcons.other;
              return (
              <div key={e.id} className="flex items-center gap-2 py-1">
                <span className={`w-7 h-7 rounded-lg ${ti.bg} flex items-center justify-center shrink-0`}>{ti.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.title}</p>
                  <p className="text-xs text-[var(--nanny-gray)]">
                    {new Date(e.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  e.status === 'confirmed' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                }`}>
                  {e.status === 'confirmed' ? <><CheckCircle2 size={10} /> Conf.</> : <><Clock size={10} /> Pend.</>}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={`Tareas pendientes (${tasks.length})`} icon={<CheckSquare size={16} className="text-amber-500" />}>
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--nanny-gray)]">Sin tareas pendientes</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full ${
                  t.priority === 'high' || t.priority === 'urgent' ? 'bg-[var(--nanny-orange)]' : 'bg-[var(--nanny-blue)]'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{t.title}</p>
                  {t.due_date && (
                    <p className="text-xs text-[var(--nanny-gray)]">
                      Vence: {new Date(t.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
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

function RutinasTab({ routines }: { routines: Routine[] }) {
  const grouped = {
    morning: routines.filter(r => r.type === 'morning'),
    afternoon: routines.filter(r => r.type === 'afternoon'),
    night: routines.filter(r => r.type === 'night'),
  };

  const sections = [
    { key: 'morning' as const, title: 'Mañana', icon: <Sunrise size={16} className="text-amber-500" />, items: grouped.morning },
    { key: 'afternoon' as const, title: 'Tarde', icon: <Sun size={16} className="text-orange-500" />, items: grouped.afternoon },
    { key: 'night' as const, title: 'Noche', icon: <Moon size={16} className="text-indigo-500" />, items: grouped.night },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {sections.map(section => (
        section.items.length > 0 && (
          <Card key={section.key} title={section.title} icon={section.icon}>
            <div className="space-y-2">
              {section.items.map(routine => (
                <div key={routine.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="text-xs text-[var(--nanny-purple)] font-mono w-16">
                    {routine.time_start || '--:--'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{routine.name}</p>
                    {routine.description && (
                      <p className="text-xs text-[var(--nanny-gray)]">{routine.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ))}
      {routines.length === 0 && (
        <div className="text-center py-8 text-[var(--nanny-gray)]">
          <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin rutinas registradas</p>
          <p className="text-xs mt-1">Puedes agregar rutinas desde el chat</p>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">{icon}{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-[var(--nanny-gray)]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
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
