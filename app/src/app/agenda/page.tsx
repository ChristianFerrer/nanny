'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock, MapPin, Circle, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt, Plus, Settings, Repeat } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, getRoutines, getRoutineExceptions, completeTask, getCachedSnapshot, invalidateTableCache } from '@/lib/store';
import { useRealtimeFamily } from '@/lib/realtime';
import type { FamilyEvent, Child, Task, Medication, Routine, RoutineException } from '@/lib/types';

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

  const typeIcons: Record<string, { icon: React.ReactNode; bg: string }> = {
    doctor: { icon: <Stethoscope size={14} className="text-red-500" />, bg: 'bg-red-50' },
    school: { icon: <GraduationCap size={14} className="text-blue-500" />, bg: 'bg-blue-50' },
    birthday: { icon: <Cake size={14} className="text-pink-500" />, bg: 'bg-pink-50' },
    activity: { icon: <Trophy size={14} className="text-green-500" />, bg: 'bg-green-50' },
    travel: { icon: <Plane size={14} className="text-purple-500" />, bg: 'bg-purple-50' },
    other: { icon: <MapPinAlt size={14} className="text-gray-500" />, bg: 'bg-gray-50' },
  };

  const typeColor: Record<string, string> = {
    doctor: 'border-l-red-400', school: 'border-l-blue-400', birthday: 'border-l-pink-400',
    activity: 'border-l-green-400', travel: 'border-l-purple-400', other: 'border-l-gray-400',
  };

  const monthYear = startOfWeek.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="px-4 pt-header pb-4 border-b border-[var(--separator)]">
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton size-8 rounded-full" />
            <div className="skeleton h-5 w-32" />
            <div className="skeleton size-8 rounded-full" />
          </div>
          <div className="flex justify-between gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton h-16 w-12 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="skeleton h-20 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white page-enter">
      {/* Header — sticky, glass, Apple-style */}
      <header className="glass px-4 pt-header pb-3 sticky top-0 z-10">
        {/* Title + (botón Hoy condicional) + settings gear */}
        <div className="flex items-center justify-between mb-2">
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
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            aria-label="Semana anterior"
            className="size-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-headline text-[var(--text-primary)] capitalize font-semibold tabular-nums">{monthYear}</p>
            {weekOffset !== 0 ? (
              <p className="text-caption text-[var(--text-tertiary)] tabular-nums">
                Hoy: {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })}
              </p>
            ) : (
              <button
                onClick={() => setSelectedDayIdx(prev => prev === null ? todayInitialIdx : null)}
                className="text-caption text-[var(--text-tertiary)] font-medium hover:text-[var(--nanny-purple)] transition-colors"
              >
                {selectedDayIdx === null ? 'Vista de día' : 'Toda la semana'}
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            aria-label="Semana siguiente"
            className="size-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day pills — radio selection, 12px labels, 3-letter format, mini-timeline */}
        <div role="radiogroup" aria-label="Día de la semana" className="flex justify-between gap-1">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = selectedDayIdx === i;
            const dayEvents = events.filter(e => new Date(e.date_start).toDateString() === day.toDateString());
            const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());
            const dayLabel = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][i];

            // Mini-timeline: para cada uno de 6 segmentos de 4h, decidir el "tipo
            // dominante" (event > medication > task > none) usando prioridad. Así
            // el strip muestra a un vistazo qué tipo de cosas tiene cada día.
            const dayMeds = medications.filter(m => {
              if (m.status !== 'active') return false;
              const start = new Date(m.start_date);
              const end = m.end_date ? new Date(m.end_date) : new Date(8.64e15);
              const dMid = new Date(day); dMid.setHours(0, 0, 0, 0);
              return dMid >= start && dMid <= end;
            });
            // Por hora: event=3, med=2, task=1, none=0 (tomamos el max por slot)
            const hourBuckets = Array.from({ length: 24 }, (_, h) => {
              const hasEvent = dayEvents.some(e => new Date(e.date_start).getHours() === h);
              if (hasEvent) return 'event';
              const hasMed = dayMeds.some(m => (m.schedule_times || []).some(t => parseInt(t.split(':')[0], 10) === h));
              if (hasMed) return 'med';
              const hasTask = dayTasks.some(t => t.due_date && new Date(t.due_date).getHours() === h);
              if (hasTask) return 'task';
              return null;
            });
            // Comprimir a 6 segmentos de 4h con el "más fuerte" en ese rango
            const segments = Array.from({ length: 6 }, (_, s): 'event' | 'med' | 'task' | null => {
              const slice = hourBuckets.slice(s * 4, s * 4 + 4);
              if (slice.includes('event')) return 'event';
              if (slice.includes('med')) return 'med';
              if (slice.includes('task')) return 'task';
              return null;
            });

            return (
              <button
                key={i}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${dayLabel} ${day.getDate()}, ${dayEvents.length} eventos, ${dayTasks.length} tareas, ${dayMeds.length} tratamientos`}
                onClick={() => setSelectedDayIdx(i)}
                className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 px-1 rounded-xl transition-all min-w-0 focus-ring ${
                  isSelected
                    ? 'bg-[var(--nanny-purple)] text-white shadow-sm'
                    : isToday
                      ? 'bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--gray-100)]'
                }`}
              >
                <span className="font-semibold leading-none" style={{ fontSize: '12px' }}>{dayLabel}</span>
                <span className="text-headline font-semibold leading-none tabular-nums">{day.getDate()}</span>
                {/* Mini-timeline: 6 segments representando 4h cada uno */}
                <div className="flex gap-[1px] mt-1 w-full px-0.5" aria-hidden="true">
                  {segments.map((kind, idx) => {
                    let bg: string;
                    if (kind === null) {
                      bg = isSelected ? 'bg-white/20' : 'bg-[var(--gray-200)]';
                    } else if (isSelected) {
                      // Cuando el día está seleccionado (fondo morado), todos los
                      // segments en blanco para mantener contraste limpio
                      bg = 'bg-white';
                    } else {
                      bg = kind === 'event' ? 'bg-[var(--nanny-purple)]'
                        : kind === 'med' ? 'bg-[var(--danger)]'
                        : 'bg-[var(--warning)]';
                    }
                    return (
                      <span
                        key={idx}
                        className={`flex-1 h-[3px] rounded-full transition-colors ${bg}`}
                      />
                    );
                  })}
                </div>
                {dayTasks.length > 0 && (
                  <span className={`text-[9px] font-semibold leading-none tabular-nums ${
                    isSelected ? 'text-white/90' : 'text-[var(--warning)]'
                  }`}>
                    {dayTasks.length} {dayTasks.length === 1 ? 'tarea' : 'tareas'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

      </header>

      {/* Day-by-day events — filtered when a day is selected */}
      <div className="px-4 py-4 space-y-4 pb-20">
        {days
          .map((day, i) => ({ day, i }))
          .filter(({ i }) => selectedDayIdx === null || selectedDayIdx === i)
          .map(({ day, i }) => {
          const dayEvents = events.filter(e => {
            const ed = new Date(e.date_start);
            return ed.toDateString() === day.toDateString();
          });
          const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());

          // Routines: expandir las que aplican a este día de la semana,
          // excluyendo las que tienen excepción cancelada para esta fecha.
          // days_of_week sigue la convención JS: 0=domingo, 1=lunes, ...
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

          // Smart label: HOY / MAÑANA / nombre del día
          const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
          const tomorrowMid = new Date(todayMid); tomorrowMid.setDate(tomorrowMid.getDate() + 1);
          const dayMid = new Date(day); dayMid.setHours(0, 0, 0, 0);
          let smartLabel: string;
          if (dayMid.getTime() === todayMid.getTime()) smartLabel = 'HOY';
          else if (dayMid.getTime() === tomorrowMid.getTime()) smartLabel = 'MAÑANA';
          else smartLabel = day.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();

          return (
            <div
              key={i}
              className={isPast && selectedDayIdx === null ? 'opacity-50' : ''}
            >
              <h3 className={`text-xs font-semibold mb-2 text-balance ${
                selectedDayIdx === i ? 'text-[var(--nanny-purple)]' : isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'
              }`}>
                {smartLabel}
              </h3>
              {hasNothing ? (
                <Link
                  href="/chat"
                  className="block bg-white rounded-xl p-4 text-center hover:bg-[var(--gray-50)] transition-colors focus-ring"
                >
                  <p className="text-sm text-[var(--text-tertiary)]">Día libre.</p>
                  <p className="text-caption text-[var(--nanny-purple)] font-semibold mt-1 text-pretty">
                    ¿Querés agendar algo? Decile a Nanny →
                  </p>
                </Link>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(event => {
                    const child = getChild(event.child_id);
                    const time = new Date(event.date_start).toLocaleTimeString('es', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <div
                        key={event.id}
                        className={`bg-white rounded-xl p-3 border-l-4 ${typeColor[event.event_type] || 'border-l-gray-400'} shadow-sm cursor-pointer active:scale-[0.98] transition-transform`}
                        onClick={() => router.push(`/evento/${event.id}`)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`size-7 rounded-lg ${(typeIcons[event.event_type] || typeIcons.other).bg} flex items-center justify-center shrink-0`}>{(typeIcons[event.event_type] || typeIcons.other).icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)]">
                              <span className="flex items-center gap-0.5 tabular-nums">
                                <Clock size={10} /> {time}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPin size={10} /> {event.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {child && <span className="size-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {dayRoutines.map(({ routine, exception }) => {
                    const child = getChild(routine.child_id);
                    const start = exception?.time_start_override || routine.time_start;
                    const end = exception?.time_end_override || routine.time_end;
                    const timeLabel = start && end ? `${start.slice(0, 5)} – ${end.slice(0, 5)}` : start ? start.slice(0, 5) : '';
                    return (
                      <div
                        key={routine.id}
                        onClick={() => child && router.push(`/hijo/${child.id}`)}
                        className="rounded-xl p-3 border-l-4 cursor-pointer active:scale-[0.98] transition-transform"
                        style={{
                          background: 'var(--gray-50)',
                          borderLeftColor: 'var(--nanny-purple)',
                          borderLeftStyle: 'dashed',
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <span className="size-7 rounded-lg bg-[var(--nanny-purple-tint)] flex items-center justify-center shrink-0">
                            <Repeat size={14} className="text-[var(--nanny-purple)]" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-[var(--text-secondary)]">{routine.name}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-tertiary)]">
                              {timeLabel && (
                                <span className="flex items-center gap-0.5 tabular-nums">
                                  <Clock size={10} /> {timeLabel}
                                </span>
                              )}
                              <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--nanny-purple)]">Rutina</span>
                            </div>
                          </div>
                          {child && <span className="size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: child.color || 'var(--nanny-purple)' }}>{child.name.charAt(0)}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {dayTasks.map(task => {
                    const child = getChild(task.child_id);
                    return (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-3 border-l-4 border-l-amber-400 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
                        onClick={() => router.push(`/tarea/${task.id}`)}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                            aria-label="Completar tarea"
                            className="mt-0.5 text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors shrink-0"
                          >
                            <Circle size={18} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)]">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium priority-${task.priority}`}>
                                {task.priority}
                              </span>
                              {task.assigned_to && (
                                <span className="text-[var(--nanny-gray)]">asignado</span>
                              )}
                            </div>
                          </div>
                          {child && <span className="size-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* Las tareas sin fecha viven en la tab "Tareas" — no se mezclan con la agenda. */}

        {/* Tratamientos activos viven en /hijo/[id] → tab Salud. La agenda solo
            muestra las TOMAS individuales en su hora dentro del día — la lista
            general de tratamientos es info estable del perfil del hijo. */}
      </div>

      {/* FAB → chat. Crear manual lo hace el usuario menos del 5%; el flujo natural
          es decirle a Nanny en el chat y que ella lo capture. */}
      <Link
        href="/chat"
        aria-label="Decirle a Nanny"
        className="fixed right-4 z-30 size-14 rounded-full bg-[var(--nanny-purple)] shadow-lg flex items-center justify-center active:scale-95 transition-transform focus-ring"
        style={{ bottom: 'calc(var(--nav-h) + 12px)' }}
      >
        <Plus size={24} className="text-white" />
      </Link>
    </div>
  );
}
