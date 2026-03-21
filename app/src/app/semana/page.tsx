'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle2, Circle, Pill, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt, X, CheckSquare, CalendarDays, User as UserIcon } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, getParents, completeTask, getCachedSnapshot } from '@/lib/store';
import type { FamilyEvent, Child, Task, Medication, Parent } from '@/lib/types';

type DetailItem = { type: 'event'; item: FamilyEvent } | { type: 'task'; item: Task } | null;

export default function SemanaPage() {
  const _snap = getCachedSnapshot();
  const [events, setEvents] = useState<FamilyEvent[]>(_snap?.events || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailItem>(null);

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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white border-b px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { setWeekOffset(w => w - 1); setSelectedDayIdx(null); }}
            className="p-2 rounded-full hover:bg-[var(--nanny-gray-light)]"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <h1 className="font-semibold capitalize">{monthYear}</h1>
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDayIdx(null); }}
                className="text-xs text-[var(--nanny-purple)] font-medium"
              >
                Ir a esta semana
              </button>
            )}
          </div>
          <button
            onClick={() => { setWeekOffset(w => w + 1); setSelectedDayIdx(null); }}
            className="p-2 rounded-full hover:bg-[var(--nanny-gray-light)]"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day pills — selectable */}
        <div className="flex justify-between">
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = selectedDayIdx === i;
            const dayEvents = events.filter(e => {
              const ed = new Date(e.date_start);
              return ed.toDateString() === day.toDateString();
            });
            const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
            return (
              <button
                key={i}
                onClick={() => {
                  // Toggle: deselect if already selected, otherwise select
                  setSelectedDayIdx(prev => prev === i ? null : i);
                }}
                className={`flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all min-w-[44px] ${
                  isSelected
                    ? 'bg-[var(--nanny-purple)] text-white scale-105'
                    : isToday
                      ? 'bg-[var(--nanny-purple-bg)] text-[var(--nanny-purple)] ring-2 ring-[var(--nanny-purple)]'
                      : 'hover:bg-[var(--nanny-gray-light)]'
                }`}
              >
                <span className={`text-[10px] font-medium ${
                  isSelected ? 'text-white/80' : isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'
                }`}>
                  {dayNames[i]}
                </span>
                <span className="text-base font-bold">
                  {day.getDate()}
                </span>
                {(() => {
                  const dayTasks = tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === day.toDateString());
                  const hasItems = dayEvents.length > 0 || dayTasks.length > 0;
                  return hasItems ? (
                    <div className="flex gap-0.5">
                      {dayEvents.length > 0 && (
                        <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--nanny-purple)]'}`} />
                      )}
                      {dayTasks.length > 0 && (
                        <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/60' : 'bg-[var(--nanny-orange)]'}`} />
                      )}
                    </div>
                  ) : null;
                })()}
              </button>
            );
          })}
        </div>
      </div>

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

          return (
            <div
              key={i}
              className={isPast && selectedDayIdx === null ? 'opacity-50' : ''}
            >
              <h3 className={`text-xs font-semibold mb-2 ${
                selectedDayIdx === i ? 'text-[var(--nanny-purple)]' : isToday ? 'text-[var(--nanny-purple)]' : 'text-[var(--nanny-gray)]'
              }`}>
                {isToday ? 'HOY' : day.toLocaleDateString('es', { weekday: 'long', day: 'numeric' }).toUpperCase()}
              </h3>
              {hasNothing ? (
                <div className="bg-white rounded-xl p-3 text-center text-sm text-[var(--nanny-gray)]">
                  Sin eventos ni tareas
                </div>
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
        {/* Tasks without due date */}
        {tasks.filter(t => !t.due_date).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold mb-2 text-[var(--nanny-gray)]">
              TAREAS SIN FECHA
            </h3>
            <div className="space-y-2">
              {tasks.filter(t => !t.due_date).map(task => {
                const child = getChild(task.child_id);
                return (
                  <div key={task.id} className="bg-white rounded-xl p-3 border-l-4 border-l-amber-400 shadow-sm cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setDetail({ type: 'task', item: task })}>
                    <div className="flex items-start gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                        className="mt-0.5 text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors shrink-0"
                      >
                        <Circle size={18} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{task.title}</p>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium priority-${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>
                      {child && <span className="w-5 h-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setDetail(null)}>
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
