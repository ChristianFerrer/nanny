'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, MapPin, Circle, Plus, Repeat } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import DayTimeline from '@/components/DayTimeline';
import { getEvents, getChildren, getTasks, getMedications, getRoutines, getRoutineExceptions, completeTask, getCachedSnapshot, invalidateTableCache } from '@/lib/store';
import { useRealtimeFamily } from '@/lib/realtime';
import type { FamilyEvent, Child, Task, Medication, Routine, RoutineException } from '@/lib/types';

// Número de semana ISO (lunes como primer día), estilo "S21" de Apple Calendar.
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

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
  const [viewMode, setViewMode] = useState<'list' | 'day'>('list');
  const todayInitialIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // Monday=0 ... Sunday=6
  })();
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayInitialIdx);
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

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const getChild = (id: string | null) => children.find(c => c.id === id);

  const monthName = startOfWeek.toLocaleDateString('es', { month: 'long' });
  const monthYear = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${startOfWeek.getFullYear()}`;

  const dayHasItems = (day: Date) => {
    const dstr = day.toDateString();
    if (events.some(e => new Date(e.date_start).toDateString() === dstr)) return true;
    if (tasks.some(t => t.due_date && new Date(t.due_date).toDateString() === dstr)) return true;
    const dow = day.getDay();
    return routines.some(r => r.active && r.days_of_week.includes(dow));
  };

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  const goToday = () => { setWeekOffset(0); setSelectedDayIdx(todayInitialIdx); };
  const selectDay = (i: number) => { setSelectedDayIdx(i); setViewMode('day'); };

  if (loading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="px-4 pt-header pb-4 border-b border-[var(--separator)]">
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton h-8 w-28 rounded-lg" />
            <div className="skeleton h-8 w-24 rounded-full" />
          </div>
          <div className="flex justify-between gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-10 rounded-full" />
            ))}
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="skeleton h-5 w-24 rounded" />
          <div className="skeleton h-12 w-full rounded-xl" />
          <div className="skeleton h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white page-enter">
      <header className="glass px-4 pt-header pb-2 sticky top-0 z-[var(--z-sticky)]">
        <div className="mb-3">
          <PageHeader
            title="Agenda"
            subtitle="Eventos, rutinas y tareas"
            right={
              <div className="bg-[var(--gray-100)] p-0.5 rounded-lg flex text-caption font-semibold">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-[var(--text-primary)] shadow-xs' : 'text-[var(--text-secondary)]'}`}
                >
                  Lista
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === 'day' ? 'bg-white text-[var(--text-primary)] shadow-xs' : 'text-[var(--text-secondary)]'}`}
                >
                  Día
                </button>
              </div>
            }
          />
        </div>

        {/* Navegación de semana */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            aria-label="Semana anterior"
            className="size-9 rounded-full flex items-center justify-center text-[var(--nanny-purple)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronLeft size={22} />
          </button>
          <p className="text-callout text-[var(--text-primary)] font-semibold tabular-nums">{monthYear}</p>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            aria-label="Semana siguiente"
            className="size-9 rounded-full flex items-center justify-center text-[var(--nanny-purple)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Week strip */}
        <div role="radiogroup" aria-label="Día de la semana" className="flex justify-between">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = viewMode === 'day' && selectedDayIdx === i;
            const dayLabel = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][i];
            const hasItems = dayHasItems(day);

            return (
              <button
                key={i}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i]} ${day.getDate()}`}
                onClick={() => selectDay(i)}
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
                  className={`size-1 rounded-full ${hasItems && !isSelected ? 'bg-[var(--nanny-purple)]' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </header>

      {/* Cuerpo: vista Lista (semana agrupada) o vista Día (timeline) */}
      {viewMode === 'day' ? (
        <div className="pt-4">
          {/* Encabezado del día seleccionado */}
          <div className="flex items-baseline gap-2 px-4 mb-1">
            <span className="text-caption text-[var(--text-tertiary)] tabular-nums">S{isoWeek(days[selectedDayIdx])}</span>
            <h2 className="text-headline font-semibold first-letter:uppercase text-[var(--text-primary)]">
              {days[selectedDayIdx].toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
          </div>
          <DayTimeline
            day={days[selectedDayIdx]}
            events={events}
            routines={routines}
            routineExceptions={routineExceptions}
            tasks={tasks}
            children={children}
            onComplete={handleComplete}
          />
        </div>
      ) : (
        <div className="px-4 py-4 space-y-5 pb-24">
          {(() => {
            const withItems = days.map((day, i) => ({ day, i })).filter(({ day }) => dayHasItems(day));
            if (withItems.length === 0) {
              return (
                <Link href="/chat" className="block rounded-2xl bg-[var(--gray-50)] px-4 py-5 hover:bg-[var(--gray-100)] transition-colors focus-ring">
                  <p className="text-subhead text-[var(--text-tertiary)]">Semana libre</p>
                  <p className="text-caption text-[var(--nanny-purple)] font-medium mt-0.5 text-pretty">Decile a Nanny qué agendar →</p>
                </Link>
              );
            }
            return withItems.map(({ day, i }) => {
              const dstr = day.toDateString();
              const dayEvents = events.filter(e => new Date(e.date_start).toDateString() === dstr);
              const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === dstr);
              const dow = day.getDay();
              const dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const dayRoutines = routines
                .filter(r => r.active && r.days_of_week.includes(dow))
                .map(r => ({ routine: r, exception: routineExceptions.find(rx => rx.routine_id === r.id && rx.date === dayIso) }))
                .filter(({ exception }) => !exception || !exception.cancelled);

              const isToday = dstr === today.toDateString();
              const total = dayEvents.length + dayRoutines.length + dayTasks.length;

              return (
                <section key={i}>
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <h2 className={`text-headline font-semibold capitalize ${isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--text-primary)]'}`}>
                      {day.toLocaleDateString('es', { weekday: 'long' })}
                    </h2>
                    <span className={`text-subhead font-medium tabular-nums ${isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--text-tertiary)]'}`}>
                      {day.toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="ml-auto text-caption text-[var(--text-tertiary)] tabular-nums">S{isoWeek(day)}</span>
                  </div>

                  <div className="rounded-2xl bg-white border border-[var(--border-subtle)] overflow-hidden shadow-xs">
                    {dayEvents.map((event, idx) => {
                      const child = getChild(event.child_id);
                      const color = child?.color || 'var(--nanny-purple)';
                      const isLast = idx === dayEvents.length - 1 && dayRoutines.length === 0 && dayTasks.length === 0;
                      const startMidnight = (() => { const d = new Date(event.date_start); return d.getHours() === 0 && d.getMinutes() === 0 && !event.date_end; })();
                      return (
                        <button
                          key={event.id}
                          onClick={() => router.push(`/evento/${event.id}`)}
                          className={`w-full flex items-stretch gap-2.5 px-3 py-2.5 text-left active:bg-[var(--gray-50)] transition-colors ${isLast ? '' : 'border-b border-[var(--border-subtle)]'}`}
                        >
                          <span className="w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                          {child && (
                            <span className="size-6 self-center rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: child.color || 'var(--nanny-purple)' }}>
                              {child.name.charAt(0)}
                            </span>
                          )}
                          <span className="flex-1 min-w-0 self-center">
                            <span className="block text-callout font-medium text-[var(--text-primary)] leading-snug truncate">{event.title}</span>
                            {event.location && (
                              <span className="flex items-center gap-1 mt-0.5 text-caption text-[var(--text-tertiary)] truncate">
                                <MapPin size={11} /> {event.location}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-right self-center">
                            {startMidnight ? (
                              <span className="text-footnote text-[var(--text-tertiary)]">todo el día</span>
                            ) : (
                              <>
                                <span className="block text-footnote font-semibold text-[var(--text-primary)] tabular-nums">{fmtTime(event.date_start)}</span>
                                {event.date_end && (
                                  <span className="block text-caption text-[var(--text-tertiary)] tabular-nums">{fmtTime(event.date_end)}</span>
                                )}
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}

                    {dayRoutines.map(({ routine, exception }, idx) => {
                      const child = getChild(routine.child_id);
                      const color = child?.color || 'var(--nanny-purple)';
                      const start = exception?.time_start_override || routine.time_start;
                      const end = exception?.time_end_override || routine.time_end;
                      const isLast = idx === dayRoutines.length - 1 && dayTasks.length === 0;
                      return (
                        <button
                          key={routine.id}
                          onClick={() => child && router.push(`/hijo/${child.id}`)}
                          className={`w-full flex items-stretch gap-2.5 px-3 py-2.5 text-left active:bg-[var(--gray-50)] transition-colors ${isLast ? '' : 'border-b border-[var(--border-subtle)]'}`}
                        >
                          <span className="w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                          <span className="size-6 self-center shrink-0 flex items-center justify-center">
                            <Repeat size={14} className="text-[var(--nanny-purple)]" />
                          </span>
                          <span className="flex-1 min-w-0 self-center">
                            <span className="block text-callout font-medium text-[var(--text-secondary)] leading-snug truncate">{routine.name}</span>
                            <span className="text-caption text-[var(--text-tertiary)]">Rutina</span>
                          </span>
                          <span className="shrink-0 text-right self-center">
                            {start ? (
                              <>
                                <span className="block text-footnote font-semibold text-[var(--text-primary)] tabular-nums">{start.slice(0, 5)}</span>
                                {end && <span className="block text-caption text-[var(--text-tertiary)] tabular-nums">{end.slice(0, 5)}</span>}
                              </>
                            ) : (
                              <span className="text-footnote text-[var(--text-tertiary)]">—</span>
                            )}
                          </span>
                        </button>
                      );
                    })}

                    {dayTasks.map((task, idx) => {
                      const child = getChild(task.child_id);
                      const isLast = idx === dayTasks.length - 1;
                      return (
                        <div
                          key={task.id}
                          onClick={() => router.push(`/tarea/${task.id}`)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 cursor-pointer active:bg-[var(--gray-50)] transition-colors ${isLast ? '' : 'border-b border-[var(--border-subtle)]'}`}
                        >
                          <span className="w-[3px] shrink-0 self-stretch rounded-full bg-[var(--text-quaternary)]" />
                          <button
                            onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                            aria-label="Completar tarea"
                            className="shrink-0 text-[var(--text-quaternary)] hover:text-[var(--nanny-purple)] transition-colors focus-ring rounded-full"
                          >
                            <Circle size={20} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-callout font-medium text-[var(--text-primary)] leading-snug truncate">{task.title}</p>
                            {task.priority !== 'normal' && (
                              <span className={`text-caption font-medium ${task.priority === 'urgent' || task.priority === 'high' ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`}>
                                {task.priority}
                              </span>
                            )}
                          </div>
                          {child && (
                            <span className="size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: child.color || 'var(--nanny-purple)' }}>
                              {child.name.charAt(0)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            });
          })()}
        </div>
      )}

      {/* "Hoy" — pill fijo abajo-izquierda, estilo Apple Calendar */}
      <button
        onClick={goToday}
        className="fixed left-4 z-[var(--z-raised)] h-11 px-5 rounded-full bg-white border border-[var(--border-subtle)] shadow-lg text-callout font-semibold text-[var(--nanny-purple)] active:scale-95 transition-transform focus-ring"
        style={{ bottom: 'calc(var(--nav-h) + 12px)' }}
      >
        Hoy
      </button>

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
