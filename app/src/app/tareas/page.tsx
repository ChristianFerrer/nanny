'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, X, Save, Trash2, Layers, Settings } from 'lucide-react';
import { getTasks, getChildren, getParents, completeTask, uncompleteTask, getCachedSnapshot, updateTask, deleteTask } from '@/lib/store';
import { buildGroupedTasks, type GroupOrTask } from '@/lib/task-grouping';
import { TaskList } from '@/components/TaskList';
import type { Task, Child, Parent } from '@/lib/types';

export default function TareasPage() {
  const _snap = getCachedSnapshot();
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [loading, setLoading] = useState(!_snap);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [t, c, p] = await Promise.all([getTasks(), getChildren(), getParents()]);
      setTasks(t);
      setChildren(c);
      setParents(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggle = async (t: Task) => {
    if (t.status === 'done') {
      await uncompleteTask(t.id);
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'pending', completed_at: null } : x));
    } else {
      await completeTask(t.id);
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'done', completed_at: new Date().toISOString() } : x));
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveTask = async (id: string, updates: Partial<Task>) => {
    await updateTask(id, updates);
    setTasks(prev => prev.map(x => x.id === id ? { ...x, ...updates } : x));
    setEditingTask(null);
  };

  const handleDeleteTask = async (id: string) => {
    await deleteTask(id);
    setTasks(prev => prev.filter(x => x.id !== id && x.parent_task_id !== id));
    setEditingTask(null);
  };

  const items = buildGroupedTasks(tasks);
  const sections = bucketize(items);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-header pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-large-title text-[var(--text-primary)]">Tareas</h1>
          <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">
            Pendientes con y sin fecha
          </p>
        </div>
        <Link
          href="/perfil"
          aria-label="Configuración"
          className="w-10 h-10 mt-1 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
        >
          <Settings size={24} />
        </Link>
      </header>

      <div className="px-4 space-y-5">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-20 w-full rounded-2xl" />
            <div className="skeleton h-20 w-full rounded-2xl" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="card text-center py-10 px-5">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-3">
              <Sparkles size={22} className="text-[var(--nanny-purple)]" />
            </div>
            <p className="text-subhead text-[var(--text-primary)]">Todo al día</p>
            <p className="text-footnote text-[var(--text-tertiary)] mt-1">
              Cuéntale a Nanny en el chat lo que haga falta y se irá creando aquí.
            </p>
            <Link href="/chat" className="btn btn-tinted btn-sm mt-4 inline-flex">
              Abrir chat
            </Link>
          </div>
        ) : (
          <>
            <SectionLabel title="Vencidas" count={sections.overdue.length} accent="var(--warning)" />
            {sections.overdue.length > 0 && (
              <TaskList items={sections.overdue} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={setEditingTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Esta semana" count={sections.thisWeek.length} />
            {sections.thisWeek.length > 0 && (
              <TaskList items={sections.thisWeek} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={setEditingTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Sin fecha" count={sections.undated.length} />
            {sections.undated.length > 0 && (
              <TaskList items={sections.undated} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={setEditingTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Completadas" count={sections.done.length} />
            {sections.done.length > 0 && (
              <TaskList items={sections.done} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={setEditingTask} onToggleCollapse={toggleCollapse} muted />
            )}
          </>
        )}
      </div>

      {editingTask && (
        <TaskEditSheet
          task={editingTask}
          parents={parents}
          children={children}
          tasks={tasks}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}

function SectionLabel({ title, count, accent }: { title: string; count: number; accent?: string }) {
  if (count === 0) return null;
  return (
    <h2 className="text-caption mb-2 px-1 uppercase tracking-wider" style={{ color: accent || 'var(--text-tertiary)' }}>
      {title} <span className="text-[var(--text-quaternary)] font-normal">· {count}</span>
    </h2>
  );
}

/**
 * Agrupa los items en buckets temporales. Para grupos, el bucket se decide
 * por el estado AGREGADO de las hijas pendientes (vencidas / esta semana /
 * sin fecha) o "completadas" cuando todas están done.
 */
function bucketize(items: GroupOrTask[]): { overdue: GroupOrTask[]; thisWeek: GroupOrTask[]; undated: GroupOrTask[]; done: GroupOrTask[] } {
  const now = new Date();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const buckets = { overdue: [] as GroupOrTask[], thisWeek: [] as GroupOrTask[], undated: [] as GroupOrTask[], done: [] as GroupOrTask[] };

  for (const it of items) {
    if (it.kind === 'group') {
      const g = it.group;
      if (g.allDone) buckets.done.push(it);
      else if (g.hasOverdue) buckets.overdue.push(it);
      else if (g.hasPendingThisWeek) buckets.thisWeek.push(it);
      else buckets.undated.push(it);
    } else {
      const t = it.task;
      if (t.status === 'done') buckets.done.push(it);
      else if (!t.due_date) buckets.undated.push(it);
      else {
        const due = new Date(t.due_date);
        if (due < now) buckets.overdue.push(it);
        else if (due <= weekEnd) buckets.thisWeek.push(it);
        else buckets.undated.push(it);
      }
    }
  }
  return buckets;
}

function TaskEditSheet({
  task, parents, children, tasks, onClose, onSave, onDelete,
}: {
  task: Task;
  parents: Parent[];
  children: Child[];
  tasks: Task[];
  onClose: () => void;
  onSave: (id: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [assignedTo, setAssignedTo] = useState<string | null>(task.assigned_to);
  const [childId, setChildId] = useState<string | null>(task.child_id);
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '');
  const [status, setStatus] = useState<Task['status']>(task.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isParent = !task.parent_task_id && tasks.some(t => t.parent_task_id === task.id);
  const childCount = isParent ? tasks.filter(t => t.parent_task_id === task.id).length : 0;

  const handleSave = async () => {
    setSaving(true);
    const updates: Partial<Task> = {
      title: title.trim(),
      assigned_to: assignedTo,
      child_id: childId,
      due_date: dueDate ? new Date(dueDate + 'T00:00:00').toISOString() : null,
      status,
      completed_at: status === 'done' && task.status !== 'done' ? new Date().toISOString() : (status !== 'done' ? null : task.completed_at),
    };
    await onSave(task.id, updates);
    setSaving(false);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="sheet-header flex items-center justify-between">
          <h2 className="text-title-3 text-[var(--text-primary)]">
            {isParent ? 'Tarea paraguas' : 'Editar tarea'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-[var(--text-secondary)] focus-ring"
          >
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body space-y-4">
          {isParent && (
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--nanny-purple-tint)' }}>
              <p className="text-caption text-[var(--nanny-purple)] font-semibold uppercase tracking-wider mb-0.5">
                <Layers size={12} className="inline mr-1" /> Grupo de tareas
              </p>
              <p className="text-footnote text-[var(--text-secondary)]">
                Esta tarea agrupa {childCount} {childCount === 1 ? 'sub-actividad' : 'sub-actividades'}. Editá cada una por separado.
              </p>
            </div>
          )}

          <div>
            <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Título</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          {!isParent && (
            <>
              <div>
                <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Asignado a</label>
                <div className="flex gap-2 flex-wrap">
                  <ChipButton active={assignedTo === null} onClick={() => setAssignedTo(null)}>Sin asignar</ChipButton>
                  {parents.map(p => (
                    <ChipButton key={p.id} active={assignedTo === p.id} onClick={() => setAssignedTo(p.id)}>
                      {p.name}
                    </ChipButton>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Hijo (opcional)</label>
                <div className="flex gap-2 flex-wrap">
                  <ChipButton active={childId === null} onClick={() => setChildId(null)}>Ninguno</ChipButton>
                  {children.map(c => (
                    <ChipButton key={c.id} active={childId === c.id} onClick={() => setChildId(c.id)}>
                      {c.name}
                    </ChipButton>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Vencimiento (opcional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>

              <div>
                <label className="text-caption text-[var(--text-tertiary)] mb-2 block uppercase tracking-wider">Estado</label>
                <div className="flex gap-2">
                  <ChipButton active={status === 'pending'} onClick={() => setStatus('pending')}>Pendiente</ChipButton>
                  <ChipButton active={status === 'done'} onClick={() => setStatus('done')}>Completada</ChipButton>
                  <ChipButton active={status === 'cancelled'} onClick={() => setStatus('cancelled')}>Cancelada</ChipButton>
                </div>
              </div>
            </>
          )}

          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn btn-primary btn-block">
            <Save size={18} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn btn-block mt-1"
              style={{ background: 'transparent', color: 'var(--danger)' }}
            >
              <Trash2 size={16} /> {isParent ? 'Eliminar grupo y sus actividades' : 'Eliminar tarea'}
            </button>
          ) : (
            <div className="rounded-xl p-3" style={{ background: 'var(--danger-soft)' }}>
              <p className="text-footnote text-[var(--text-primary)] mb-2">
                {isParent
                  ? `Se borrarán ${childCount} sub-actividades junto con el grupo. ¿Confirmás?`
                  : '¿Eliminar esta tarea?'}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm flex-1">Cancelar</button>
                <button onClick={() => onDelete(task.id)} className="btn btn-destructive btn-sm flex-1">Eliminar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ChipButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-footnote font-medium transition-colors focus-ring"
      style={{
        background: active ? 'var(--nanny-purple)' : 'var(--gray-100)',
        color: active ? 'white' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
