'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle2, Circle, Pill, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt, X, CheckSquare, CalendarDays, User as UserIcon, Plus, Settings } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, getParents, completeTask, getCachedSnapshot } from '@/lib/store';
import type { FamilyEvent, Child, Task, Medication, Parent } from '@/lib/types';

type DetailItem = { type: 'event'; item: FamilyEvent } | { type: 'task'; item: Task } | null;

export default function AgendaPage() {
  const _snap = getCachedSnapshot();
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [weekOffset, setWeekOffset] = useState(0);
  // Default: today selected (radio); user can switch to full-week via "Toda la semana"
  const todayInitialIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // Monday=0 ... Sunday=6
  })();
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(todayInitialIdx);
  const [detail, setDetail] = useState<DetailItem>(null);
  const [loading, setLoading] = useState(!_snap);

  const loadData = useCallback(async () => {
    try {
      const [e, c, t, m, p] = await Promise.all([getEvents(), getChildren(), getTasks(), getMedications(), getParents()]);
      setEvents(e);
      setChildren(c);
      setTasks(t);
      setMedications(m);
      setParents(p);
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
  const getParent = (id: string | null) => parents.find(p => p.id === id);

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
      <div className="min-h-screen bg-white">
        <div className="px-4 pt-header pb-4 border-b border-[var(--separator)]">
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-8 w-8 rounded-full" />
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
    <div className="min-h-screen bg-white page-enter">
      {/* Header — sticky, glass, Apple-style */}
      <header className="glass px-4 pt-header pb-3 sticky top-0 z-10">
        {/* Title + (botón Hoy condicional) + settings gear */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-title-3 text-[var(--text-primary)] font-semibold">Agenda</h1>
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
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
            >
              <Settings size={18} />
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            aria-label="Semana anterior"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-headline text-[var(--text-primary)] capitalize font-semibold">{monthYear}</p>
            {weekOffset !== 0 ? (
              <p className="text-caption text-[var(--text-tertiary)]">
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
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
                <span className="text-headline font-semibold leading-none">{day.getDate()}</span>
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
                  <span className={`text-[9px] font-semibold leading-none ${
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
          const isToday = day.toDateString() === today.toDateString();
          const isPast = day < today && !isToday;
          const hasNothing = dayEvents.length === 0 && dayTasks.length === 0;

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
              <h3 className={`text-xs font-semibold mb-2 ${
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
                  <p className="text-caption text-[var(--nanny-purple)] font-semibold mt-1">
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
                        onClick={() => setDetail({ type: 'event', item: event })}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`w-7 h-7 rounded-lg ${(typeIcons[event.event_type] || typeIcons.other).bg} flex items-center justify-center shrink-0`}>{(typeIcons[event.event_type] || typeIcons.other).icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)]">
                              <span className="flex items-center gap-0.5">
                                <Clock size={10} /> {time}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPin size={10} /> {event.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {child && <span className="w-5 h-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
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
                        onClick={() => setDetail({ type: 'task', item: task })}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
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
                          {child && <span className="w-5 h-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
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

        {/* Active medications */}
        {medications.filter(m => m.status === 'active').length > 0 && (
          <div>
            <h3 className="text-xs font-semibold mb-2 text-[var(--nanny-purple)]">
              TRATAMIENTOS ACTIVOS
            </h3>
            <div className="space-y-2">
              {medications.filter(m => m.status === 'active').map(med => (
                <div key={med.id} className="bg-white rounded-xl p-3 border-l-4 border-l-purple-400 shadow-sm">
                  <p className="font-medium text-sm inline-flex items-center gap-1.5"><Pill size={14} className="text-[var(--nanny-purple)]" /> {med.medication_name}</p>
                  <p className="text-xs text-[var(--nanny-gray)] mt-0.5">
                    {med.child_name} — {med.frequency || ''} — {med.schedule_times?.join(', ') || ''}
                  </p>
                  <p className="text-[10px] text-[var(--nanny-gray)] mt-0.5">
                    {med.start_date} al {med.end_date || '?'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FAB → chat. Crear manual lo hace el usuario menos del 5%; el flujo natural
          es decirle a Nanny en el chat y que ella lo capture. */}
      <Link
        href="/chat"
        aria-label="Decirle a Nanny"
        className="fixed right-4 z-30 w-14 h-14 rounded-full bg-[var(--nanny-purple)] shadow-lg flex items-center justify-center active:scale-95 transition-transform focus-ring"
        style={{ bottom: 'calc(var(--nav-h) + 12px)' }}
      >
        <Plus size={24} className="text-white" />
      </Link>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-t-2xl w-full max-w-[430px] max-h-[70vh] overflow-y-auto animate-slide-up pb-20"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-5 pt-4 pb-2 flex items-center justify-between border-b border-gray-100 z-10">
              <h2 className="font-semibold text-lg">
                {detail.type === 'event' ? 'Detalle del evento' : 'Detalle de la tarea'}
              </h2>
              <button onClick={() => setDetail(null)} className="p-1 text-[var(--nanny-gray)]">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {detail.type === 'event' && (() => {
                const event = detail.item;
                const child = getChild(event.child_id);
                const iconConfig = typeIcons[event.event_type] || typeIcons.other;
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl ${iconConfig.bg} flex items-center justify-center`}>{iconConfig.icon}</div>
                      <div>
                        <h3 className="font-semibold text-lg">{event.title}</h3>
                        <span className="text-xs text-[var(--nanny-gray)] capitalize">{event.event_type}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarDays size={16} className="text-[var(--nanny-purple)]" />
                        <span>{new Date(event.date_start).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock size={16} className="text-[var(--nanny-purple)]" />
                        <span>{new Date(event.date_start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin size={16} className="text-[var(--nanny-purple)]" />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {child && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-6 h-6 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[10px] font-bold text-[var(--nanny-purple)]">{child.name.charAt(0)}</span>
                          <span>{child.name}</span>
                        </div>
                      )}
                      {event.description && (
                        <div className="bg-[var(--nanny-gray-light)] rounded-xl p-3">
                          <p className="text-sm text-[var(--nanny-gray)]">{event.description}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-[var(--nanny-gray)]">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${event.status === 'confirmed' ? 'bg-green-100 text-green-700' : event.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {event.status === 'confirmed' ? 'Confirmado' : event.status === 'cancelled' ? 'Cancelado' : event.status === 'completed' ? 'Completado' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
              {detail.type === 'task' && (() => {
                const task = detail.item;
                const child = getChild(task.child_id);
                const assignedParent = getParent(task.assigned_to);
                const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                        <CheckSquare size={20} className="text-amber-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{task.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium priority-${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {task.due_date && (
                        <div className={`flex items-center gap-2 text-sm ${isOverdue ? 'text-[var(--nanny-red)]' : ''}`}>
                          <Clock size={16} className={isOverdue ? 'text-[var(--nanny-red)]' : 'text-[var(--nanny-purple)]'} />
                          <span>{new Date(task.due_date).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                          {isOverdue && <span className="text-xs font-medium">(vencida)</span>}
                        </div>
                      )}
                      {assignedParent && (
                        <div className="flex items-center gap-2 text-sm">
                          <UserIcon size={16} className="text-[var(--nanny-purple)]" />
                          <span>Asignada a {assignedParent.name}</span>
                        </div>
                      )}
                      {child && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-6 h-6 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[10px] font-bold text-[var(--nanny-purple)]">{child.name.charAt(0)}</span>
                          <span>{child.name}</span>
                        </div>
                      )}
                      {task.description && (
                        <div className="bg-[var(--nanny-gray-light)] rounded-xl p-3">
                          <p className="text-sm text-[var(--nanny-gray)]">{task.description}</p>
                        </div>
                      )}
                      <button
                        onClick={() => { handleComplete(task.id); setDetail(null); }}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-green)] text-white py-3 rounded-xl font-medium text-sm"
                      >
                        <CheckCircle2 size={16} /> Marcar como completada
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
