'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle2, Circle, Pill } from 'lucide-react';
import { getEvents, getChildren, getTasks, getMedications, completeTask } from '@/lib/store';
import type { FamilyEvent, Child, Task, Medication } from '@/lib/types';

export default function SemanaPage() {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [e, c, t, m] = await Promise.all([getEvents(), getChildren(), getTasks(), getMedications()]);
      setEvents(e);
      setChildren(c);
      setTasks(t);
      setMedications(m);
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

  const typeEmoji: Record<string, string> = {
    doctor: '🏥', school: '🏫', birthday: '🎂', activity: '⚽', travel: '✈️', other: '📌',
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
                className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-xl transition-all ${
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
                <span className="text-sm font-semibold">
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
                {isToday ? '📍 HOY' : day.toLocaleDateString('es', { weekday: 'long', day: 'numeric' }).toUpperCase()}
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
                        className={`bg-white rounded-xl p-3 border-l-4 ${typeColor[event.event_type] || 'border-l-gray-400'} shadow-sm`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{typeEmoji[event.event_type] || '📌'}</span>
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
                          {child && <span className="text-lg">{child.emoji}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {dayTasks.map(task => {
                    const child = getChild(task.child_id);
                    return (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-3 border-l-4 border-l-amber-400 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => handleComplete(task.id)}
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
                          {child && <span className="text-lg">{child.emoji}</span>}
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
              📋 TAREAS SIN FECHA
            </h3>
            <div className="space-y-2">
              {tasks.filter(t => !t.due_date).map(task => {
                const child = getChild(task.child_id);
                return (
                  <div key={task.id} className="bg-white rounded-xl p-3 border-l-4 border-l-amber-400 shadow-sm">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => handleComplete(task.id)}
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
                      {child && <span className="text-lg">{child.emoji}</span>}
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
              💊 TRATAMIENTOS ACTIVOS
            </h3>
            <div className="space-y-2">
              {medications.filter(m => m.status === 'active').map(med => (
                <div key={med.id} className="bg-white rounded-xl p-3 border-l-4 border-l-purple-400 shadow-sm">
                  <p className="font-medium text-sm">💊 {med.medication_name}</p>
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
    </div>
  );
}
