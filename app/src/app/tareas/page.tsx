'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Circle, CheckCircle2, Sparkles, ChevronDown, ChevronRight, Layers, X, Save, Trash2 } from 'lucide-react';
import { getTasks, getChildren, getParents, completeTask, uncompleteTask, getCachedSnapshot, updateTask, deleteTask } from '@/lib/store';
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

  const childById = (id: string | null) => id ? children.find(c => c.id === id) : null;
  const parentById = (id: string | null) => id ? parents.find(p => p.id === id) : null;

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

  const groups = groupTasks(tasks);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-14 pb-4">
        <h1 className="text-large-title text-[var(--text-primary)]">Tareas</h1>
        <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">
          Pendientes con y sin fecha
        </p>
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
            <Section title="Vencidas" groups={groups.overdue} childById={childById} parentById={parentById} onToggle={toggle} onToggleCollapse={toggleCollapse} onEdit={setEditingTask} collapsed={collapsedGroups} accent="var(--warning)" />
            <Section title="Esta semana" groups={groups.thisWeek} childById={childById} parentById={parentById} onToggle={toggle} onToggleCollapse={toggleCollapse} onEdit={setEditingTask} collapsed={collapsedGroups} />
            <Section title="Sin fecha" groups={groups.undated} childById={childById} parentById={parentById} onToggle={toggle} onToggleCollapse={toggleCollapse} onEdit={setEditingTask} collapsed={collapsedGroups} />
            <Section title="Completadas" groups={groups.done} childById={childById} parentById={parentById} onToggle={toggle} onToggleCollapse={toggleCollapse} onEdit={setEditingTask} collapsed={collapsedGroups} muted />
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

type GroupOrTask =
  | { kind: 'task'; task: Task }
  | { kind: 'group'; parent: Task; children: Task[] };

type Groups = {
  overdue: GroupOrTask[];
  thisWeek: GroupOrTask[];
  undated: GroupOrTask[];
  done: GroupOrTask[];
};

function groupTasks(tasks: Task[]): Groups {
  const now = new Date();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);

  const childrenByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id) {
      const arr = childrenByParent.get(t.parent_task_id) || [];
      arr.push(t);
      childrenByParent.set(t.parent_task_id, arr);
    }
  }

  const items: { item: GroupOrTask; bucket: keyof Groups }[] = [];

  for (const t of tasks) {
    if (t.parent_task_id) continue;

    const kids = childrenByParent.get(t.id) || [];
    if (kids.length > 0) {
      const allDone = kids.every(k => k.status === 'done');
      const item: GroupOrTask = { kind: 'group', parent: t, children: kids };
      if (allDone) items.push({ item, bucket: 'done' });
      else {
        const pendingKids = kids.filter(k => k.status !== 'done');
        const hasOverdue = pendingKids.some(k => k.due_date && new Date(k.due_date) < now);
        const hasThisWeek = pendingKids.some(k => k.due_date && new Date(k.due_date) <= weekEnd);
        if (hasOverdue) items.push({ item, bucket: 'overdue' });
        else if (hasThisWeek) items.push({ item, bucket: 'thisWeek' });
        else items.push({ item, bucket: 'undated' });
      }
    } else {
      const taskItem: GroupOrTask = { kind: 'task', task: t };
      if (t.status === 'done') items.push({ item: taskItem, bucket: 'done' });
      else if (!t.due_date) items.push({ item: taskItem, bucket: 'undated' });
      else {
        const due = new Date(t.due_date);
        if (due < now) items.push({ item: taskItem, bucket: 'overdue' });
        else if (due <= weekEnd) items.push({ item: taskItem, bucket: 'thisWeek' });
        else items.push({ item: taskItem, bucket: 'undated' });
      }
    }
  }

  return {
    overdue: items.filter(i => i.bucket === 'overdue').map(i => i.item),
    thisWeek: items.filter(i => i.bucket === 'thisWeek').map(i => i.item),
    undated: items.filter(i => i.bucket === 'undated').map(i => i.item),
    done: items.filter(i => i.bucket === 'done').map(i => i.item),
  };
}

function Section({
  title, groups, childById, parentById, onToggle, onToggleCollapse, onEdit, collapsed, accent, muted,
}: {
  title: string;
  groups: GroupOrTask[];
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (t: Task) => void;
  collapsed: Set<string>;
  accent?: string;
  muted?: boolean;
}) {
  if (groups.length === 0) return null;
  const totalCount = groups.reduce((acc, g) => acc + (g.kind === 'group' ? g.children.length : 1), 0);
  return (
    <section>
      <h2 className="text-caption mb-2 px-1 uppercase tracking-wider" style={{ color: accent || 'var(--text-tertiary)' }}>
        {title} <span className="text-[var(--text-quaternary)] font-normal">· {totalCount}</span>
      </h2>
      <div className="space-y-2">
        {groups.map(g => {
          if (g.kind === 'task') {
            return (
              <div key={g.task.id} className="list-group">
                <TaskRow task={g.task} childById={childById} parentById={parentById} onToggle={onToggle} onEdit={onEdit} muted={muted} />
              </div>
            );
          }
          const isCollapsed = collapsed.has(g.parent.id);
          return (
            <GroupCard
              key={g.parent.id}
              parent={g.parent}
              childrenTasks={g.children}
              childById={childById}
              parentById={parentById}
              onToggle={onToggle}
              onEdit={onEdit}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => onToggleCollapse(g.parent.id)}
              muted={muted}
            />
          );
        })}
      </div>
    </section>
  );
}

function GroupCard({
  parent, childrenTasks, childById, parentById, onToggle, onEdit, isCollapsed, onToggleCollapse, muted,
}: {
  parent: Task;
  childrenTasks: Task[];
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  muted?: boolean;
}) {
  const total = childrenTasks.length;
  const done = childrenTasks.filter(c => c.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={`card p-0 overflow-hidden ${muted ? 'opacity-65' : ''}`}>
      <div className="flex items-stretch">
        <button
          onClick={onToggleCollapse}
          className="flex-1 flex items-center gap-3 px-4 py-3 tap-highlight focus-ring text-left min-w-0"
          aria-label={isCollapsed ? 'Expandir grupo' : 'Colapsar grupo'}
        >
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--nanny-purple-tint)' }}>
            <Layers size={16} className="text-[var(--nanny-purple)]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-subhead text-[var(--text-primary)] truncate">{parent.title}</p>
            <p className="text-caption text-[var(--text-tertiary)]">
              {done}/{total} completadas
            </p>
          </div>
          {isCollapsed ? <ChevronRight size={16} className="text-[var(--text-quaternary)]" /> : <ChevronDown size={16} className="text-[var(--text-quaternary)]" />}
        </button>
        <button
          onClick={() => onEdit(parent)}
          className="px-3 hover:bg-[var(--gray-50)] focus-ring border-l border-[var(--separator)]"
          aria-label="Editar grupo"
        >
          <span className="text-caption text-[var(--nanny-purple)] font-semibold">Editar</span>
        </button>
      </div>
      <div className="h-1 bg-[var(--gray-100)]">
        <div className="h-full bg-[var(--nanny-purple)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      {!isCollapsed && (
        <div className="border-t border-[var(--separator)]">
          {childrenTasks.map(child => (
            <TaskRow
              key={child.id}
              task={child}
              childById={childById}
              parentById={parentById}
              onToggle={onToggle}
              onEdit={onEdit}
              muted={muted}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, childById, parentById, onToggle, onEdit, muted, indent,
}: {
  task: Task;
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  muted?: boolean;
  indent?: boolean;
}) {
  const child = childById(task.child_id);
  const assignee = parentById(task.assigned_to);
  const isDone = task.status === 'done';
  return (
    <div className={`list-row ${muted && !indent ? 'opacity-65' : ''}`} style={indent ? { paddingLeft: '24px' } : undefined}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task); }}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 focus-ring"
      >
        {isDone
          ? <CheckCircle2 size={22} className="text-[var(--success)]" />
          : <Circle size={22} className="text-[var(--text-quaternary)]" />}
      </button>
      <button
        onClick={() => onEdit(task)}
        className="flex-1 min-w-0 text-left tap-highlight focus-ring rounded-lg py-1 -my-1 px-1"
      >
        <p className={`text-subhead truncate ${isDone ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
          {task.title}
        </p>
        <p className="text-footnote text-[var(--text-tertiary)] truncate">
          {[
            task.due_date ? new Date(task.due_date).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : null,
            child ? child.name : null,
            assignee ? assignee.name : (isDone ? null : 'sin asignar'),
          ].filter(Boolean).join(' · ') || '—'}
        </p>
      </button>
    </div>
  );
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
