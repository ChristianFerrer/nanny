'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Clock, MapPin, AlertTriangle, CalendarDays, Plus, X, CalendarPlus, ListPlus, Pill, CheckSquare, Undo2, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt, User as UserIcon, BellOff, BellRing, ChevronRight } from 'lucide-react';
import { buildGroupedTasks, filterForToday } from '@/lib/task-grouping';
import { TaskList } from '@/components/TaskList';
import { getTodayEvents, getUpcomingEvents, getTasks, getChildren, getParents, completeTask, uncompleteTask, addEvent, addTask, getFamily, getMedications, getCachedSnapshot } from '@/lib/store';
import type { FamilyEvent, Task, Child, Parent, Medication } from '@/lib/types';

type ModalType = null | 'event' | 'task';
type DetailItem = { type: 'event'; item: FamilyEvent } | { type: 'task'; item: Task } | null;

export default function HoyPage() {
  const _snap = getCachedSnapshot();
  const [todayEvents, setTodayEvents] = useState<FamilyEvent[]>(() => {
    if (!_snap) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return _snap.events.filter(e => { const d = new Date(e.date_start); return d >= today && d < tomorrow; });
  });
  const [upcomingEvents, setUpcomingEvents] = useState<FamilyEvent[]>(() => {
    if (!_snap) return [];
    const now = new Date(); const end = new Date(); end.setDate(end.getDate() + 3);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return _snap.events.filter(e => { const d = new Date(e.date_start); return d >= now && d <= end && d >= tomorrow; });
  });
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [medications, setMedications] = useState<Medication[]>(_snap?.medications || []);
  const [familyId, setFamilyId] = useState(_snap?.family?.id || '');
  const [showFab, setShowFab] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [detail, setDetail] = useState<DetailItem>(null);

  // Event form
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState('other');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventChildId, setEventChildId] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  // Task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignedTo, setTaskAssignedTo] = useState('');
  const [taskChildId, setTaskChildId] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [undoToast, setUndoToast] = useState<{ taskId: string; title: string } | null>(null);
  const [loading, setLoading] = useState(!_snap);
  const [confirmToast, setConfirmToast] = useState<string | null>(null);
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set());
  const [hoyCollapsed, setHoyCollapsed] = useState<Set<string>>(new Set());

  const showConfirmToast = (msg: string) => {
    setConfirmToast(msg);
    setTimeout(() => setConfirmToast(null), 2400);
  };

  const dismissReminder = (id: string) => {
    setDismissedReminders(prev => new Set(prev).add(id));
  };

  const loadData = useCallback(async () => {
    try {
      const [fam, te, ue, t, c, p, meds] = await Promise.all([
        getFamily(), getTodayEvents(), getUpcomingEvents(3), getTasks(), getChildren(), getParents(), getMedications(),
      ]);
      if (!fam) { window.location.href = '/login'; return; }
      setFamilyId(fam.id);
      setTodayEvents(te);
      setUpcomingEvents(ue.filter(e => !te.find(te2 => te2.id === e.id)));
      setTasks(t);
      setChildren(c);
      setParents(p);
      setMedications(meds);
    } catch {
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getChild = (id: string | null) => children.find(c => c.id === id);
  const getParent = (id: string | null) => parents.find(p => p.id === id);

  const handleComplete = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    await completeTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (task) {
      setUndoToast({ taskId, title: task.title });
      setTimeout(() => setUndoToast(prev => prev?.taskId === taskId ? null : prev), 5000);
    }
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    try {
      await uncompleteTask(undoToast.taskId);
      await loadData();
    } catch { /* ignore */ }
    setUndoToast(null);
  };

  const openEventModal = () => {
    const now = new Date();
    setEventTitle('');
    setEventType('other');
    setEventDate(now.toISOString().split('T')[0]);
    setEventTime('09:00');
    setEventLocation('');
    setEventChildId('');
    setEventDescription('');
    setShowFab(false);
    setModal('event');
  };

  const openTaskModal = () => {
    setTaskTitle('');
    setTaskPriority('normal');
    setTaskDueDate('');
    setTaskAssignedTo('');
    setTaskChildId('');
    setTaskDescription('');
    setShowFab(false);
    setModal('task');
  };

  const saveEvent = async () => {
    if (!eventTitle.trim()) return;
    setSaving(true);
    const dateStart = eventTime ? `${eventDate}T${eventTime}:00` : `${eventDate}T00:00:00`;
    await addEvent({
      family_id: familyId,
      child_id: eventChildId || null,
      title: eventTitle,
      description: eventDescription || null,
      event_type: eventType,
      date_start: dateStart,
      date_end: null,
      location: eventLocation || null,
      status: 'confirmed',
      source: 'manual',
      auto_detected: false,
      created_by: null,
    });
    await loadData();
    setModal(null);
    setSaving(false);
    showConfirmToast('Evento creado');
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) return;
    setSaving(true);
    await addTask({
      family_id: familyId,
      child_id: taskChildId || null,
      parent_task_id: null,
      title: taskTitle,
      description: taskDescription || null,
      assigned_to: taskAssignedTo || null,
      due_date: taskDueDate || null,
      status: 'pending',
      priority: taskPriority,
      source: 'manual',
      auto_detected: false,
      created_by: null,
      completed_at: null,
    });
    await loadData();
    setModal(null);
    setSaving(false);
    showConfirmToast('Tarea creada');
  };

  const today = new Date();
  const dayName = today.toLocaleDateString('es', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es', { day: 'numeric', month: 'long' });

  const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const normalTasks = tasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

  // Reminders: overdue tasks + events within next 2 hours
  const now = new Date();
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now && !dismissedReminders.has(`task-${t.id}`));
  const soonEvents = todayEvents.filter(e => {
    const eventTime = new Date(e.date_start);
    const diffMs = eventTime.getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 2 * 60 * 60 * 1000 && !dismissedReminders.has(`event-${e.id}`);
  });
  const hasReminders = overdueTasks.length > 0 || soonEvents.length > 0;


  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <header className="px-5 pt-14 pb-4">
          <div className="skeleton h-4 w-24 mb-3" />
          <div className="skeleton h-9 w-48" />
          <div className="flex gap-2 mt-4">
            <div className="skeleton h-7 w-20 rounded-full" />
            <div className="skeleton h-7 w-20 rounded-full" />
          </div>
        </header>
        <div className="px-4 pb-24 space-y-3">
          <div className="skeleton h-24 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white page-enter">
      {/* Header — Apple-style large title */}
      <header className="px-5 pt-14 pb-4">
        <p className="text-footnote text-[var(--text-tertiary)] capitalize tracking-wide">{dayName}</p>
        <h1 className="text-large-title text-[var(--text-primary)] capitalize mt-0.5">{dateStr}</h1>
        {children.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {children.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1.5 bg-[var(--gray-100)] text-[var(--text-secondary)] rounded-full px-3 py-1 text-caption">
                <span className="w-4 h-4 rounded-full bg-[var(--nanny-purple-tint)] text-[var(--nanny-purple)] flex items-center justify-center text-[9px] font-semibold">{c.name.charAt(0)}</span>
                {c.name}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="px-4 py-2 space-y-5 pb-24">
        {/* Reminders — individual cards con acciones */}
        {hasReminders && (
          <section>
            <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-1 uppercase tracking-wider flex items-center gap-1.5">
              <BellRing size={12} /> Recordatorios
            </h2>
            <div className="space-y-2">
              {soonEvents.map(e => {
                const mins = Math.round((new Date(e.date_start).getTime() - now.getTime()) / 60000);
                return (
                  <div key={`event-${e.id}`} className="card flex items-center gap-3 animate-fade-in">
                    <div className="w-9 h-9 rounded-xl bg-[var(--warning-soft)] flex items-center justify-center shrink-0">
                      <Clock size={16} className="text-[var(--warning)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-subhead text-[var(--text-primary)] truncate">{e.title}</p>
                      <p className="text-footnote text-[var(--text-tertiary)]">En {mins} min · evento próximo</p>
                    </div>
                    <button
                      onClick={() => dismissReminder(`event-${e.id}`)}
                      aria-label="Descartar recordatorio"
                      className="w-8 h-8 rounded-full hover:bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-tertiary)] focus-ring"
                    >
                      <BellOff size={14} />
                    </button>
                  </div>
                );
              })}
              {overdueTasks.map(t => (
                <div key={`task-${t.id}`} className="card flex items-center gap-3 animate-fade-in">
                  <div className="w-9 h-9 rounded-xl bg-[var(--danger-soft)] flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} className="text-[var(--danger)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-subhead text-[var(--text-primary)] truncate">{t.title}</p>
                    <p className="text-footnote text-[var(--text-tertiary)]">Tarea vencida</p>
                  </div>
                  <button
                    onClick={() => { handleComplete(t.id); }}
                    aria-label="Marcar como completada"
                    className="btn btn-tinted btn-sm"
                  >
                    <CheckCircle2 size={14} /> Listo
                  </button>
                  <button
                    onClick={() => dismissReminder(`task-${t.id}`)}
                    aria-label="Descartar recordatorio"
                    className="w-8 h-8 rounded-full hover:bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-tertiary)] focus-ring"
                  >
                    <BellOff size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active treatments */}
        {medications.filter(m => m.status === 'active').length > 0 && (
          <section>
            <h2 className="text-caption text-[var(--nanny-purple)] mb-2 px-1 uppercase tracking-wider flex items-center gap-1.5">
              <Pill size={12} /> Tratamientos activos
            </h2>
            <div className="space-y-2">
              {medications.filter(m => m.status === 'active').map(med => {
                const start = new Date(med.start_date);
                const daysPassed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                const totalDays = med.duration_days || 1;
                const progress = Math.min(100, Math.round((daysPassed / totalDays) * 100));
                const daysLeft = Math.max(0, totalDays - daysPassed);
                return (
                  <Link
                    key={med.id}
                    href={`/tratamiento/${med.id}`}
                    className="block bg-white rounded-xl p-3 shadow-sm tap-highlight focus-ring"
                    aria-label={`Ver detalle del tratamiento ${med.medication_name}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm inline-flex items-center gap-1.5"><Pill size={14} className="text-[var(--nanny-purple)]" /> {med.medication_name}</p>
                        <p className="text-xs text-[var(--nanny-gray)] mt-0.5">{med.child_name} — {med.frequency || ''}</p>
                        {med.schedule_times?.length > 0 && (
                          <p className="text-xs text-[var(--nanny-gray)]">Horarios: {med.schedule_times.join(', ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-medium text-[var(--nanny-purple)] bg-[var(--nanny-purple-bg)] px-2 py-0.5 rounded-full whitespace-nowrap">
                          {daysLeft === 0 ? 'Último día' : `${daysLeft}d restantes`}
                        </span>
                        <ChevronRight size={14} className="text-[var(--text-quaternary)]" />
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 bg-[var(--nanny-gray-light)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--nanny-purple)] rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--nanny-gray)] mt-1">Día {daysPassed + 1} de {totalDays}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Today's events */}
        <section>
          <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-1 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays size={12} /> Hoy
          </h2>
          {todayEvents.length === 0 ? (
            <div className="card-flat text-center py-8 px-5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-3">
                <CalendarDays size={22} className="text-[var(--nanny-purple)]" />
              </div>
              <p className="text-subhead text-[var(--text-primary)]">Tu día está libre</p>
              <p className="text-footnote text-[var(--text-tertiary)] mt-1 mb-4">Cuéntale a Nanny qué tienes hoy o agrégalo manualmente</p>
              <button onClick={openEventModal} className="btn btn-tinted btn-sm">
                <CalendarPlus size={14} /> Agregar evento
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map(event => (
                <EventCard key={event.id} event={event} child={getChild(event.child_id)} onClick={() => setDetail({ type: 'event', item: event })} />
              ))}
            </div>
          )}
        </section>

        {/* Tasks — agrupadas por parent paraguas (igual que /tareas) */}
        {(() => {
          const groupedItems = filterForToday(buildGroupedTasks(tasks));
          const totalCount = groupedItems.reduce((acc, it) => acc + (it.kind === 'group' ? it.group.children.length : 1), 0);
          return (
            <section>
              <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-1 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare size={12} /> Tareas pendientes <span className="text-[var(--text-quaternary)] normal-case">· {totalCount}</span>
              </h2>
              {totalCount === 0 ? (
                <div className="card-flat text-center py-8 px-5">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--success-soft)] flex items-center justify-center mb-3">
                    <CheckCircle2 size={22} className="text-[var(--success)]" />
                  </div>
                  <p className="text-subhead text-[var(--text-primary)]">Todo al día</p>
                  <p className="text-footnote text-[var(--text-tertiary)] mt-1 mb-4">No tienes tareas pendientes</p>
                  <button onClick={openTaskModal} className="btn btn-tinted btn-sm">
                    <ListPlus size={14} /> Nueva tarea
                  </button>
                </div>
              ) : (
                <TaskList
                  items={groupedItems}
                  children={children}
                  parents={parents}
                  collapsedGroups={hoyCollapsed}
                  onToggle={(t) => handleComplete(t.id)}
                  onToggleCollapse={(id) => setHoyCollapsed(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
                />
              )}
            </section>
          );
        })()}

        {/* Upcoming */}
        {upcomingEvents.length > 0 && (
          <section>
            <h2 className="text-caption text-[var(--text-tertiary)] mb-2 px-1 uppercase tracking-wider">
              Próximos días
            </h2>
            <div className="space-y-2">
              {upcomingEvents.map(event => (
                <EventCard key={event.id} event={event} child={getChild(event.child_id)} showDate onClick={() => setDetail({ type: 'event', item: event })} />
              ))}
            </div>
          </section>
        )}
      </div>

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
                const iconConfig = EVENT_ICONS[event.event_type] || EVENT_ICONS.other;
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
                        {event.source && <span>Fuente: {event.source}</span>}
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

      {/* Confirmation toast */}
      {confirmToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-slide-up" style={{ maxWidth: '380px', width: '90%' }}>
          <div className="flex items-center gap-2 glass-dark rounded-2xl px-4 py-3 shadow-lg">
            <CheckCircle2 size={16} className="text-[var(--success)] shrink-0" />
            <span className="text-subhead text-white flex-1">{confirmToast}</span>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undoToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-slide-up" style={{ maxWidth: '380px', width: '90%' }}>
          <div className="flex items-center gap-2 bg-gray-800 text-white rounded-xl px-4 py-3 shadow-lg">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <span className="text-sm flex-1 truncate">{undoToast.title} completada</span>
            <button onClick={handleUndo} className="flex items-center gap-1 text-sm font-medium text-[var(--nanny-purple-light)] shrink-0">
              <Undo2 size={14} /> Deshacer
            </button>
          </div>
        </div>
      )}

      {/* FAB con safe-area */}
      <div
        className="fixed right-4 z-30"
        style={{ bottom: 'calc(var(--nav-h) + 12px)' }}
      >
        {showFab && (
          <div className="mb-2 space-y-2 animate-slide-up">
            <button
              onClick={openEventModal}
              className="flex items-center gap-2 bg-white shadow-md rounded-full px-4 py-2.5 text-subhead text-[var(--text-primary)] w-full active:scale-[0.97] transition-transform border border-[var(--border-subtle)]"
            >
              <CalendarPlus size={18} className="text-[var(--nanny-purple)]" /> Nuevo evento
            </button>
            <button
              onClick={openTaskModal}
              className="flex items-center gap-2 bg-white shadow-md rounded-full px-4 py-2.5 text-subhead text-[var(--text-primary)] w-full active:scale-[0.97] transition-transform border border-[var(--border-subtle)]"
            >
              <ListPlus size={18} className="text-[var(--nanny-purple)]" /> Nueva tarea
            </button>
          </div>
        )}
        <button
          onClick={() => setShowFab(!showFab)}
          aria-label={showFab ? 'Cerrar' : 'Crear'}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ml-auto focus-ring ${
            showFab
              ? 'bg-[var(--gray-800)] rotate-45 shadow-md'
              : 'bg-[var(--nanny-purple)] shadow-lg active:scale-95'
          }`}
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      {/* Bottom sheet — Crear evento / tarea */}
      {modal && (
        <>
          <div className="sheet-backdrop" onClick={() => setModal(null)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={modal === 'event' ? 'Nuevo evento' : 'Nueva tarea'}>
            <div className="sheet-handle" />
            <div className="sheet-header flex items-center justify-between">
              <h2 className="text-title-3 text-[var(--text-primary)]">
                {modal === 'event' ? 'Nuevo evento' : 'Nueva tarea'}
              </h2>
              <button
                onClick={() => setModal(null)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-secondary)] focus-ring"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheet-body space-y-4">
              {modal === 'event' && (
                <>
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    placeholder="Título del evento"
                    autoFocus
                  />
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Tipo</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {EVENT_TYPES.map(t => (
                        <button
                          key={t.value}
                          onClick={() => setEventType(t.value)}
                          className={`px-3 py-1.5 rounded-full text-footnote font-medium inline-flex items-center gap-1.5 transition-colors ${
                            eventType === t.value
                              ? 'bg-[var(--nanny-purple)] text-white'
                              : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Fecha</label>
                      <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Hora</label>
                      <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
                    </div>
                  </div>
                  <input type="text" value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="Lugar (opcional)" />
                  {children.length > 0 && (
                    <div>
                      <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Hijo</label>
                      <select value={eventChildId} onChange={e => setEventChildId(e.target.value)}>
                        <option value="">Todos</option>
                        {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  <textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
                  <button onClick={saveEvent} disabled={saving || !eventTitle.trim() || !eventDate} className="btn btn-primary btn-block">
                    <CalendarPlus size={18} /> {saving ? 'Guardando…' : 'Crear evento'}
                  </button>
                </>
              )}
              {modal === 'task' && (
                <>
                  <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Título de la tarea" autoFocus />
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Prioridad</label>
                    <div className="flex gap-1.5">
                      {TASK_PRIORITIES.map(p => (
                        <button
                          key={p.value}
                          onClick={() => setTaskPriority(p.value)}
                          className={`flex-1 py-2 rounded-full text-footnote font-medium transition-colors ${
                            taskPriority === p.value
                              ? `priority-${p.value}`
                              : 'bg-[var(--gray-100)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Fecha límite</label>
                    <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
                  </div>
                  {parents.length > 0 && (
                    <div>
                      <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Asignar a</label>
                      <select value={taskAssignedTo} onChange={e => setTaskAssignedTo(e.target.value)}>
                        <option value="">Sin asignar</option>
                        {parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  {children.length > 0 && (
                    <div>
                      <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Hijo</label>
                      <select value={taskChildId} onChange={e => setTaskChildId(e.target.value)}>
                        <option value="">Ninguno</option>
                        {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  <textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} />
                  <button onClick={saveTask} disabled={saving || !taskTitle.trim()} className="btn btn-primary btn-block">
                    <ListPlus size={18} /> {saving ? 'Guardando…' : 'Crear tarea'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const EVENT_TYPES = [
  { value: 'doctor', label: 'Médico', icon: <Stethoscope size={14} /> },
  { value: 'school', label: 'Escuela', icon: <GraduationCap size={14} /> },
  { value: 'birthday', label: 'Cumple', icon: <Cake size={14} /> },
  { value: 'activity', label: 'Actividad', icon: <Trophy size={14} /> },
  { value: 'travel', label: 'Viaje', icon: <Plane size={14} /> },
  { value: 'other', label: 'Otro', icon: <MapPinAlt size={14} /> },
];

const TASK_PRIORITIES: { value: 'low' | 'normal' | 'high' | 'urgent'; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const EVENT_ICONS: Record<string, { icon: React.ReactNode; bg: string }> = {
  doctor: { icon: <Stethoscope size={18} className="text-red-500" />, bg: 'bg-red-50' },
  school: { icon: <GraduationCap size={18} className="text-blue-500" />, bg: 'bg-blue-50' },
  birthday: { icon: <Cake size={18} className="text-pink-500" />, bg: 'bg-pink-50' },
  activity: { icon: <Trophy size={18} className="text-green-500" />, bg: 'bg-green-50' },
  travel: { icon: <Plane size={18} className="text-purple-500" />, bg: 'bg-purple-50' },
  other: { icon: <MapPinAlt size={18} className="text-gray-500" />, bg: 'bg-gray-50' },
};

function EventCard({ event, child, showDate, onClick }: { event: FamilyEvent; child?: Child; showDate?: boolean; onClick?: () => void }) {
  const time = new Date(event.date_start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const iconConfig = EVENT_ICONS[event.event_type] || EVENT_ICONS.other;

  return (
    <div className="bg-white rounded-xl p-3 flex items-start gap-3 shadow-sm cursor-pointer active:scale-[0.98] transition-transform" onClick={onClick}>
      <div className={`w-9 h-9 rounded-xl ${iconConfig.bg} flex items-center justify-center shrink-0`}>{iconConfig.icon}</div>
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
        <span className="w-6 h-6 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[10px] font-bold text-[var(--nanny-purple)] shrink-0" title={child.name}>{child.name.charAt(0)}</span>
      )}
    </div>
  );
}

function TaskCard({ task, child, parent, onComplete, onClick }: {
  task: Task; child?: Child; parent?: Parent; onComplete: (id: string) => void; onClick?: () => void;
}) {
  const [completing, setCompleting] = useState(false);

  const handleClick = async () => {
    setCompleting(true);
    // Small delay for visual satisfaction before removing
    setTimeout(() => onComplete(task.id), 600);
  };

  const dueStr = task.due_date
    ? new Date(task.due_date).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
    : null;

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div className={`bg-white rounded-xl p-3 flex items-start gap-3 shadow-sm transition-all duration-500 cursor-pointer active:scale-[0.98] ${completing ? 'opacity-30 scale-95' : ''}`} onClick={onClick}>
      <button onClick={(e) => { e.stopPropagation(); handleClick(); }} className="mt-0.5 text-[var(--nanny-gray)] hover:text-[var(--nanny-green)] transition-colors">
        {completing ? <CheckCircle2 size={20} className="text-[var(--nanny-green)]" /> : <Circle size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{task.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-[var(--nanny-gray)] flex-wrap">
          {parent && (
            <span className="flex items-center gap-1">
              <UserIcon size={11} className="text-[var(--nanny-gray)]" /> {parent.name}
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
      {child && <span className="w-5 h-5 rounded-full bg-[var(--nanny-purple-bg)] flex items-center justify-center text-[9px] font-bold text-[var(--nanny-purple)] shrink-0">{child.name.charAt(0)}</span>}
    </div>
  );
}
