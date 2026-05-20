'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Circle, Plus, Settings } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, getRoutines, getRoutineExceptions, completeTask, getCachedSnapshot, invalidateTableCache } from '@/lib/store';
import { useRealtimeFamily } from '@/lib/realtime';
import type { FamilyEvent, Child, Task, Medication, Routine, RoutineException } from '@/lib/types';

// Estilo de card alineado al mockup de la landing (AgendaMockup).
const CARD = 'flex items-start gap-3 p-3 w-full text-left rounded-[14px]';
const CARD_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};

export default function AgendaPage() {
  const router = useRouter();
  const _snap = getCachedSnapshot();
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [routines, setRoutines] = useState<Routine[]>(_snap?.routines || []);
  const [routineExceptions, setRoutineExceptions] = useState<RoutineException[]>(_snap?.routineExceptions || []);
  const [weekOffset, setWeekOffset] = useState(0);
  // Default: today selected (radio); user can switch to full-week via "Toda la semana"
  const todayInitialIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // Monday=0 ... Sunday=6
  })();
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(todayInitialIdx);
  const [loading, setLoading] = useState(!_snap);

  const loadData = useCallback(async () => {
    try {
      const [e, c, t, m, r, rx] = await Promise.all([
        getEvents(), getChildren(), getTasks(), getMedications(),
        getRoutines(), getRoutineExceptions(),
      ]);
      setEvents(e);
      setChildren(c);
      setTasks(t);
      setMedications(m);
      setRoutines(r);
      setRoutineExceptions(rx);
    } catch {
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  }, []);

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time sync: cuando otro padre agrega/edita/borra algo, invalidar
  // las caches relevantes y refetchear sin esperar al próximo refresh manual.
  const familyId = _snap?.family?.id || '';
  useRealtimeFamily({
    familyId,
    tables: ['events', 'tasks', 'medications', 'routines', 'routine_exceptions'],
    enabled: !!familyId,
    onChange: () => {
      invalidateTableCache('events');
      invalidateTableCache('tasks');
      invalidateTableCache('medications');
      invalidateTableCache('routines');
      invalidateTableCache('routine_exceptions');
      loadData();
    },
  });

  // Calculate week dates
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const getChild = (id: string | null) => children.find(c => c.id === id);

  const monthYear = startOfWeek.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  // ¿El día tiene algo? (para el punto bajo el número, estilo iOS Calendar)
  const dayHasItems = (day: Date) => {
    const ds = day.toDateString();
    if (events.some(e => new Date(e.date_start).toDateString() === ds)) return true;
    if (tasks.some(t => t.due_date && new Date(t.due_date).toDateString() === ds)) return true;
    const dow = day.getDay();
    return routines.some(r => r.active && r.days_of_week.includes(dow));
  };

  // Avatar circular con color del hijo + inicial (como el mockup).
  const Avatar = ({ child, fallback }: { child?: Child; fallback: string }) => (
    <span
      className="size-10 rounded-full flex items-center justify-center text-white text-[15px] font-semibold shrink-0"
      style={{ background: child?.color || 'var(--nanny-purple)' }}
    >
      {(child?.name || fallback).charAt(0).toUpperCase()}
    </span>
  );

  if (loading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="px-4 pt-header pb-4 border-b border-[var(--separator)]">
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton h-8 w-28 rounded-lg" />
            <div className="skeleton size-9 rounded-full" />
          </div>
          <div className="flex justify-between gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-10 rounded-full" />
            ))}
          </div>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="skeleton h-5 w-24 rounded" />
          <div className="skeleton h-16 w-full rounded-[14px]" />
          <div className="skeleton h-16 w-full rounded-[14px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white page-enter">
      {/* Header — mes navegable + strip de días estilo iOS */}
      <header className="glass px-4 pt-header pb-2 sticky top-0 z-[var(--z-sticky)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-large-title text-[var(--text-primary)] text-balance">Agenda</h1>
          <div className="flex items-center gap-2">
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDayIdx(todayInitialIdx); }}
                aria-label="Ir a hoy"
                className="px-3 h-9 rounded-full bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)] text-caption font-semibold focus-ring active:scale-95 transition-transform"
              >
                Hoy
              </button>
            )}
            <Link
              href="/perfil"
              aria-label="Configuración"
              className="size-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
            >
              <Settings size={24} />
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            aria-label="Semana anterior"
            className="size-9 rounded-full flex items-center justify-center text-[var(--nanny-purple)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="text-center">
            <p className="text-headline text-[var(--text-primary)] capitalize font-semibold tabular-nums">{monthYear}</p>
            {weekOffset !== 0 ? (
              <p className="text-caption text-[var(--text-tertiary)] tabular-nums">
                Hoy · {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}
              </p>
            ) : (
              <button
                onClick={() => setSelectedDayIdx(prev => prev === null ? todayInitialIdx : null)}
                className="text-caption text-[var(--nanny-purple)] font-medium"
              >
                {selectedDayIdx === null ? 'Vista de día' : 'Toda la semana'}
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            aria-label="Semana siguiente"
            className="size-9 rounded-full flex items-center justify-center text-[var(--nanny-purple)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Week strip — letra + número, día seleccionado en círculo morado */}
        <div role="radiogroup" aria-label="Día de la semana" className="flex justify-between">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = selectedDayIdx === i;
            const dayEvents = events.filter(e => new Date(e.date_start).toDateString() === day.toDateString());
            const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());
            const dayMeds = medications.filter(m => m.status === 'active');
            const dayLabel = ['L', 'M', 'M', 'J', 'V', 'S', 'D'][i];
            const hasItems = dayHasItems(day);

            return (
              <button
                key={i}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i]} ${day.getDate()}, ${dayEvents.length} eventos, ${dayTasks.length} tareas, ${dayMeds.length} tratamientos`}
                onClick={() => setSelectedDayIdx(i)}
                className="flex-1 flex flex-col items-center gap-1 py-1 focus-ring rounded-xl"
              >
                <span className={`text-caption-2 font-medium ${isSelected ? 'text-[var(--nanny-purple)]' : 'text-[var(--text-tertiary)]'}`}>
                  {dayLabel}
                </span>
                <span
                  className={`size-9 rounded-full flex items-center justify-center text-callout font-semibold tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-[var(--nanny-purple)] text-white'
                      : isToday
                        ? 'text-[var(--nanny-purple)]'
                        : 'text-[var(--text-primary)]'
                  }`}
                >
                  {day.getDate()}
                </span>
                <span
                  className={`size-1 rounded-full ${hasItems ? 'bg-[var(--nanny-purple)]' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </header>

      {/* Lista — cards por item, estilo landing AgendaMockup */}
      <div className="px-4 py-4 space-y-5 pb-24">
        {days
          .map((day, i) => ({ day, i }))
          .filter(({ i }) => selectedDayIdx === null || selectedDayIdx === i)
          .map(({ day, i }) => {
          const dayEvents = events.filter(e => {
            const ed = new Date(e.date_start);
            return ed.toDateString() === day.toDateString();
          });
          const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());

          const dow = day.getDay();
          const dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const dayRoutines = routines
            .filter(r => r.active && r.days_of_week.includes(dow))
            .map(r => {
              const exception = routineExceptions.find(rx => rx.routine_id === r.id && rx.date === dayIso);
              return { routine: r, exception };
            })
            .filter(({ exception }) => !exception || !exception.cancelled);

          const isToday = day.toDateString() === today.toDateString();
          const isPast = day < today && !isToday;
          const hasNothing = dayEvents.length === 0 && dayTasks.length === 0 && dayRoutines.length === 0;

          const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
          const tomorrowMid = new Date(todayMid); tomorrowMid.setDate(tomorrowMid.getDate() + 1);
          const dayMid = new Date(day); dayMid.setHours(0, 0, 0, 0);
          let label: string;
          if (dayMid.getTime() === todayMid.getTime()) label = 'Hoy';
          else if (dayMid.getTime() === tomorrowMid.getTime()) label = 'Mañana';
          else label = day.toLocaleDateString('es', { weekday: 'long' });

          return (
            <section key={i} className={isPast && selectedDayIdx === null ? 'opacity-50' : ''}>
              {/* Encabezado de día */}
              <div className="flex items-baseline gap-2 mb-2.5 px-1">
                <h2 className={`text-headline font-semibold capitalize ${isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--text-primary)]'}`}>
                  {label}
                </h2>
                <span className={`text-subhead font-medium tabular-nums ${isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--text-tertiary)]'}`}>
                  {day.toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                </span>
              </div>

              {hasNothing ? (
                <Link
                  href="/chat"
                  className="block rounded-[14px] px-4 py-3.5 focus-ring"
                  style={CARD_STYLE}
                >
                  <p className="text-subhead text-[var(--text-tertiary)]">Día libre</p>
                  <p className="text-caption text-[var(--nanny-purple)] font-medium mt-0.5 text-pretty">Decile a Nanny qué agendar →</p>
                </Link>
              ) : (
                <div className="space-y-2.5">
                  {dayEvents.map(event => {
                    const child = getChild(event.child_id);
                    const time = new Date(event.date_start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
                    const sub = [child?.name, event.location].filter(Boolean).join(' · ');
                    return (
                      <button
                        key={event.id}
                        onClick={() => router.push(`/evento/${event.id}`)}
                        className={`${CARD} active:scale-[0.99] transition-transform`}
                        style={CARD_STYLE}
                      >
                        <Avatar child={child} fallback={event.title} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-subhead font-semibold text-[var(--text-primary)] truncate">{event.title}</span>
                          {sub && <span className="block text-caption text-[var(--text-tertiary)] truncate mt-0.5">{sub}</span>}
                        </span>
                        <span className="text-caption font-semibold text-[var(--nanny-purple)] shrink-0 tabular-nums pt-0.5">{time}</span>
                      </button>
                    );
                  })}

                  {dayRoutines.map(({ routine, exception }) => {
                    const child = getChild(routine.child_id);
                    const start = exception?.time_start_override || routine.time_start;
                    const end = exception?.time_end_override || routine.time_end;
                    const timeLabel = start && end ? `${start.slice(0, 5)}–${end.slice(0, 5)}` : start ? start.slice(0, 5) : '';
                    return (
                      <button
                        key={routine.id}
                        onClick={() => child && router.push(`/hijo/${child.id}`)}
                        className={`${CARD} active:scale-[0.99] transition-transform`}
                        style={{ background: '#fff', border: '1px dashed rgba(124,58,237,0.4)' }}
                      >
                        <Avatar child={child} fallback={routine.name} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-subhead font-semibold text-[var(--text-primary)] truncate">{routine.name}</span>
                            <span className="text-caption-2 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)] shrink-0">Rutina</span>
                          </span>
                          {child && <span className="block text-caption text-[var(--text-tertiary)] truncate mt-0.5">{child.name}</span>}
                        </span>
                        {timeLabel && <span className="text-caption font-semibold text-[var(--text-tertiary)] shrink-0 tabular-nums pt-0.5">{timeLabel}</span>}
                      </button>
                    );
                  })}

                  {dayTasks.map(task => {
                    const child = getChild(task.child_id);
                    const sub = [child?.name, task.priority !== 'normal' ? task.priority : null].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={task.id}
                        onClick={() => router.push(`/tarea/${task.id}`)}
                        className={`${CARD} cursor-pointer active:scale-[0.99] transition-transform`}
                        style={CARD_STYLE}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                          aria-label="Completar tarea"
                          className="size-10 rounded-[10px] bg-[var(--gray-100)] flex items-center justify-center shrink-0 text-[var(--text-quaternary)] hover:text-[var(--nanny-purple)] transition-colors focus-ring"
                        >
                          <Circle size={18} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-subhead font-semibold text-[var(--text-primary)] truncate">{task.title}</p>
                          {sub && <p className="text-caption text-[var(--text-tertiary)] truncate mt-0.5">{sub}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* FAB → chat */}
      <Link
        href="/chat"
        aria-label="Decirle a Nanny"
        className="fixed right-4 z-[var(--z-raised)] size-14 rounded-full bg-[var(--nanny-purple)] shadow-lg flex items-center justify-center active:scale-95 transition-transform focus-ring"
        style={{ bottom: 'calc(var(--nav-h) + 12px)' }}
      >
        <Plus size={24} className="text-white" />
      </Link>
    </div>
  );
}
