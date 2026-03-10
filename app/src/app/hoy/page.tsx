'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, Clock, MapPin, AlertTriangle, CalendarDays } from 'lucide-react';
import { getTodayEvents, getUpcomingEvents, getTasks, getChildren, getParents, completeTask } from '@/lib/store';
import type { FamilyEvent, Task, Child, Parent } from '@/lib/types';

export default function HoyPage() {
  const [todayEvents, setTodayEvents] = useState<FamilyEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<FamilyEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);

  const loadData = useCallback(async () => {
    const [te, ue, t, c, p] = await Promise.all([
      getTodayEvents(), getUpcomingEvents(3), getTasks(), getChildren(), getParents(),
    ]);
    setTodayEvents(te);
    setUpcomingEvents(ue.filter(e => !te.find(te2 => te2.id === e.id)));
    setTasks(t);
    setChildren(c);
    setParents(p);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getChild = (id: string | null) => children.find(c => c.id === id);
  const getParent = (id: string | null) => parents.find(p => p.id === id);

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const today = new Date();
  const dayName = today.toLocaleDateString('es', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es', { day: 'numeric', month: 'long' });

  const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const normalTasks = tasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--nanny-purple)] text-white px-5 pt-12 pb-6 rounded-b-3xl">
        <p className="text-sm opacity-80 capitalize">{dayName}</p>
        <h1 className="text-2xl font-bold capitalize">{dateStr}</h1>
        <div className="flex gap-2 mt-3">
          {children.map(c => (
            <span key={c.id} className="bg-white/20 px-3 py-1 rounded-full text-xs">
              {c.emoji} {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5 pb-20">
        {/* Today's events */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2 flex items-center gap-1">
            <CalendarDays size={14} /> HOY
          </h2>
          {todayEvents.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-[var(--nanny-gray)]">
              No hay eventos programados para hoy 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map(event => (
                <EventCard key={event.id} event={event} child={getChild(event.child_id)} />
              ))}
            </div>
          )}
        </section>

        {/* Urgent tasks */}
        {urgentTasks.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--nanny-orange)] mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> URGENTE
            </h2>
            <div className="space-y-2">
              {urgentTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  child={getChild(task.child_id)}
                  parent={getParent(task.assigned_to)}
                  onComplete={handleComplete}
                />
              ))}
            </div>
          </section>
        )}

        {/* Normal tasks */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2">
            📋 PENDIENTES ({tasks.length})
          </h2>
          <div className="space-y-2">
            {normalTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                child={getChild(task.child_id)}
                parent={getParent(task.assigned_to)}
                onComplete={handleComplete}
              />
            ))}
          </div>
        </section>

        {/* Upcoming */}
        {upcomingEvents.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2">
              📅 PRÓXIMOS DÍAS
            </h2>
            <div className="space-y-2">
              {upcomingEvents.map(event => (
                <EventCard key={event.id} event={event} child={getChild(event.child_id)} showDate />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, child, showDate }: { event: FamilyEvent; child?: Child; showDate?: boolean }) {
  const time = new Date(event.date_start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const typeEmoji: Record<string, string> = {
    doctor: '🏥', school: '🏫', birthday: '🎂', activity: '⚽', travel: '✈️', other: '📌',
  };

  return (
    <div className="bg-white rounded-xl p-3 flex items-start gap-3 shadow-sm">
      <div className="text-xl mt-0.5">{typeEmoji[event.event_type] || '📌'}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{event.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)]">
          {showDate && (
            <span className="flex items-center gap-0.5">
              <CalendarDays size={10} />
              {new Date(event.date_start).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}
            </span>
          )}
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
      {child && (
        <span className="text-lg" title={child.name}>{child.emoji}</span>
      )}
    </div>
  );
}

function TaskCard({ task, child, parent, onComplete }: {
  task: Task; child?: Child; parent?: Parent; onComplete: (id: string) => void;
}) {
  const [completing, setCompleting] = useState(false);

  const handleClick = async () => {
    setCompleting(true);
    await onComplete(task.id);
  };

  const dueStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
    : null;

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div className={`bg-white rounded-xl p-3 flex items-start gap-3 shadow-sm transition-opacity ${completing ? 'opacity-30' : ''}`}>
      <button onClick={handleClick} className="mt-0.5 text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors">
        {completing ? <CheckCircle2 size={20} className="text-[var(--nanny-green)]" /> : <Circle size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{task.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)] flex-wrap">
          {parent && (
            <span className="flex items-center gap-0.5">
              {parent.avatar_emoji} {parent.name}
            </span>
          )}
          {dueStr && (
            <span className={`flex items-center gap-0.5 ${isOverdue ? 'text-[var(--nanny-red)] font-medium' : ''}`}>
              <Clock size={10} /> {dueStr}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium priority-${task.priority}`}>
            {task.priority}
          </span>
        </div>
      </div>
      {child && <span className="text-lg">{child.emoji}</span>}
    </div>
  );
}
