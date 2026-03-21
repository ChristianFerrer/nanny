'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, Clock, MapPin, AlertTriangle, CalendarDays, Plus, X, CalendarPlus, ListPlus, Pill, CheckSquare, Undo2, Stethoscope, GraduationCap, Trophy, Cake, Plane, MapPin as MapPinAlt, User as UserIcon } from 'lucide-react';
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
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) return;
    setSaving(true);
    await addTask({
      family_id: familyId,
      child_id: taskChildId || null,
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
  };

  const today = new Date();
  const dayName = today.toLocaleDateString('es', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es', { day: 'numeric', month: 'long' });

  const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const normalTasks = tasks.filter(t => t.priority !== 'urgent' && t.priority !== 'high');

  // Reminders: overdue tasks + events within next 2 hours
  const now = new Date();
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now);
  const soonEvents = todayEvents.filter(e => {
    const eventTime = new Date(e.date_start);
    const diffMs = eventTime.getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 2 * 60 * 60 * 1000; // within 2 hours
  });
  const hasReminders = overdueTasks.length > 0 || soonEvents.length > 0;

  // Event/Task creation modal
  if (modal) {
    return (
      <div className="min-h-screen bg-white animate-fade-in">
        <div className="px-5 pt-12 pb-8">
          <button onClick={() => setModal(null)} className="mb-4 text-[var(--nanny-gray)]">
            <X size={20} />
          </button>

          {modal === 'event' && (
            <>
              <h1 className="text-xl font-bold mb-1">Nuevo evento</h1>
              <p className="text-sm text-[var(--nanny-gray)] mb-4">Agrega un evento al calendario familiar</p>
              <div className="space-y-3">
                <input type="text" value={eventTitle} onChange={e => setEventTitle(e.target.value)}
                  placeholder="Título del evento *"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Tipo</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { value: 'doctor', label: 'M\u00e9dico', icon: <Stethoscope size={12} /> },
                      { value: 'school', label: 'Escuela', icon: <GraduationCap size={12} /> },
                      { value: 'birthday', label: 'Cumple', icon: <Cake size={12} /> },
                      { value: 'activity', label: 'Actividad', icon: <Trophy size={12} /> },
                      { value: 'travel', label: 'Viaje', icon: <Plane size={12} /> },
                      { value: 'other', label: 'Otro', icon: <MapPinAlt size={12} /> },
                    ].map(t => (
                      <button key={t.value} onClick={() => setEventType(t.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                          eventType === t.value ? 'bg-[var(--nanny-purple)] text-white' : 'bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)]'
                        }`}>{t.icon} {t.label}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Fecha *</label>
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Hora</label>
                    <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                  </div>
                </div>
                <input type="text" value={eventLocation} onChange={e => setEventLocation(e.target.value)}
                  placeholder="Lugar (opcional)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                {children.length > 0 && (
                  <div>
                    <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Hijo (opcional)</label>
                    <select value={eventChildId} onChange={e => setEventChildId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white">
                      <option value="">Todos</option>
                      {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <textarea value={eventDescription} onChange={e => setEventDescription(e.target.value)}
                  placeholder="Descripción (opcional)" rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] resize-none" />
                <button onClick={saveEvent} disabled={saving || !eventTitle.trim() || !eventDate}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40">
                  <CalendarPlus size={16} /> {saving ? 'Guardando...' : 'Crear evento'}
                </button>
              </div>
            </>
          )}

          {modal === 'task' && (
            <>
              <h1 className="text-xl font-bold mb-1">Nueva tarea</h1>
              <p className="text-sm text-[var(--nanny-gray)] mb-4">Agrega una tarea pendiente</p>
              <div className="space-y-3">
                <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Título de la tarea *"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Prioridad</label>
                  <div className="flex gap-1.5">
                    {([
                      { value: 'low' as const, label: 'Baja' },
                      { value: 'normal' as const, label: 'Normal' },
                      { value: 'high' as const, label: 'Alta' },
                      { value: 'urgent' as const, label: 'Urgente' },
                    ]).map(p => (
                      <button key={p.value} onClick={() => setTaskPriority(p.value)}
                        className={`flex-1 py-1.5 rounded-full text-xs font-medium ${
                          taskPriority === p.value ? `priority-${p.value} ring-2 ring-offset-1 ring-[var(--nanny-purple-light)]` : 'bg-[var(--nanny-gray-light)] text-[var(--nanny-gray)]'
                        }`}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Fecha límite</label>
                  <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)]" />
                </div>
                {parents.length > 0 && (
                  <div>
                    <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Asignar a</label>
                    <select value={taskAssignedTo} onChange={e => setTaskAssignedTo(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white">
                      <option value="">Sin asignar</option>
                      {parents.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role === 'mama' ? 'Mamá' : 'Papá'})</option>)}
                    </select>
                  </div>
                )}
                {children.length > 0 && (
                  <div>
                    <label className="text-xs text-[var(--nanny-gray)] mb-1 block">Relacionado a hijo</label>
                    <select value={taskChildId} onChange={e => setTaskChildId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] bg-white">
                      <option value="">Ninguno</option>
                      {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)}
                  placeholder="Descripción (opcional)" rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[var(--nanny-purple-light)] resize-none" />
                <button onClick={saveTask} disabled={saving || !taskTitle.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--nanny-purple)] text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40">
                  <ListPlus size={16} /> {saving ? 'Guardando...' : 'Crear tarea'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-[var(--nanny-purple)] text-white px-5 pt-12 pb-6 rounded-b-3xl">
        <p className="text-sm opacity-80 capitalize">{dayName}</p>
        <h1 className="text-2xl font-bold capitalize">{dateStr}</h1>
        <div className="flex gap-2 mt-3">
          {children.map(c => (
            <span key={c.id} className="bg-white/20 px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[8px] font-bold">{c.name.charAt(0)}</span>
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5 pb-24">
        {/* Reminders */}
        {hasReminders && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> RECORDATORIOS
            </h2>
            <div className="space-y-2">
              {soonEvents.map(e => {
                const mins = Math.round((new Date(e.date_start).getTime() - now.getTime()) / 60000);
                return (
                  <div key={e.id} className="flex items-center gap-2 text-sm text-amber-800">
                    <Clock size={14} />
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-amber-600">en {mins} min</span>
                  </div>
                );
              })}
              {overdueTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-red-700">
                  <AlertTriangle size={14} />
                  <span className="font-medium">{t.title}</span>
                  <span className="text-xs text-red-500">vencida</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active treatments */}
        {medications.filter(m => m.status === 'active').length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--nanny-purple)] mb-2 flex items-center gap-1">
              <Pill size={14} /> TRATAMIENTOS ACTIVOS
            </h2>
            <div className="space-y-2">
              {medications.filter(m => m.status === 'active').map(med => {
                const start = new Date(med.start_date);
                const daysPassed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                const totalDays = med.duration_days || 1;
                const progress = Math.min(100, Math.round((daysPassed / totalDays) * 100));
                const daysLeft = Math.max(0, totalDays - daysPassed);
                return (
                  <div key={med.id} className="bg-white rounded-xl p-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm inline-flex items-center gap-1.5"><Pill size={14} className="text-[var(--nanny-purple)]" /> {med.medication_name}</p>
                        <p className="text-xs text-[var(--nanny-gray)] mt-0.5">{med.child_name} — {med.frequency || ''}</p>
                        {med.schedule_times?.length > 0 && (
                          <p className="text-xs text-[var(--nanny-gray)]">Horarios: {med.schedule_times.join(', ')}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-[var(--nanny-purple)] bg-[var(--nanny-purple-bg)] px-2 py-0.5 rounded-full whitespace-nowrap">
                        {daysLeft === 0 ? 'Último día' : `${daysLeft}d restantes`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-[var(--nanny-gray-light)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--nanny-purple)] rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--nanny-gray)] mt-1">Día {daysPassed + 1} de {totalDays}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Today's events */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2 flex items-center gap-1">
            <CalendarDays size={14} /> HOY
          </h2>
          {todayEvents.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-[var(--nanny-gray)]">
              No hay eventos programados para hoy
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map(event => (
                <EventCard key={event.id} event={event} child={getChild(event.child_id)} onClick={() => setDetail({ type: 'event', item: event })} />
              ))}
            </div>
          )}
        </section>

        {/* Tasks */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2 flex items-center gap-1">
            <CheckSquare size={14} /> TAREAS PENDIENTES ({tasks.length})
          </h2>
          {tasks.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-center text-sm text-[var(--nanny-gray)]">
              No hay tareas pendientes
            </div>
          ) : (
            <div className="space-y-2">
              {urgentTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  child={getChild(task.child_id)}
                  parent={getParent(task.assigned_to)}
                  onComplete={handleComplete}
                  onClick={() => setDetail({ type: 'task', item: task })}
                />
              ))}
              {normalTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  child={getChild(task.child_id)}
                  parent={getParent(task.assigned_to)}
                  onComplete={handleComplete}
                  onClick={() => setDetail({ type: 'task', item: task })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Upcoming */}
        {upcomingEvents.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--nanny-gray)] mb-2">
              PROXIMOS DIAS
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

      {/* FAB */}
      <div className="fixed bottom-20 right-4 z-30" style={{ maxWidth: '430px' }}>
        {showFab && (
          <div className="mb-2 space-y-2 animate-slide-up">
            <button onClick={openEventModal}
              className="flex items-center gap-2 bg-white shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-[var(--nanny-purple)] w-full">
              <CalendarPlus size={18} /> Nuevo evento
            </button>
            <button onClick={openTaskModal}
              className="flex items-center gap-2 bg-white shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-[var(--nanny-purple)] w-full">
              <ListPlus size={18} /> Nueva tarea
            </button>
          </div>
        )}
        <button onClick={() => setShowFab(!showFab)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ml-auto ${
            showFab ? 'bg-[var(--nanny-gray)] rotate-45' : 'bg-[var(--nanny-purple)]'
          }`}>
          <Plus size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
}

const EVENT_ICONS: Record<string, { icon: React.ReactNode; bg: string }> = {
  doctor: { icon: <Stethoscope size={16} className="text-red-500" />, bg: 'bg-red-50' },
  school: { icon: <GraduationCap size={16} className="text-blue-500" />, bg: 'bg-blue-50' },
  birthday: { icon: <Cake size={16} className="text-pink-500" />, bg: 'bg-pink-50' },
  activity: { icon: <Trophy size={16} className="text-green-500" />, bg: 'bg-green-50' },
  travel: { icon: <Plane size={16} className="text-purple-500" />, bg: 'bg-purple-50' },
  other: { icon: <MapPinAlt size={16} className="text-gray-500" />, bg: 'bg-gray-50' },
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
