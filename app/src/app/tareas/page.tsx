'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Circle, CheckCircle2, Sparkles, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { getTasks, getChildren, getParents, completeTask, uncompleteTask, getCachedSnapshot } from '@/lib/store';
import type { Task, Child, Parent } from '@/lib/types';

export default function TareasPage() {
  const _snap = getCachedSnapshot();
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [loading, setLoading] = useState(!_snap);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
            <Section
              title="Vencidas"
              groups={groups.overdue}
              childById={childById}
              parentById={parentById}
              onToggle={toggle}
              onToggleCollapse={toggleCollapse}
              collapsed={collapsedGroups}
              accent="var(--warning)"
            />
            <Section
              title="Esta semana"
              groups={groups.thisWeek}
              childById={childById}
              parentById={parentById}
              onToggle={toggle}
              onToggleCollapse={toggleCollapse}
              collapsed={collapsedGroups}
            />
            <Section
              title="Sin fecha"
              groups={groups.undated}
              childById={childById}
              parentById={parentById}
              onToggle={toggle}
              onToggleCollapse={toggleCollapse}
              collapsed={collapsedGroups}
            />
            <Section
              title="Completadas"
              groups={groups.done}
              childById={childById}
              parentById={parentById}
              onToggle={toggle}
              onToggleCollapse={toggleCollapse}
              collapsed={collapsedGroups}
              muted
            />
          </>
        )}
      </div>
    </div>
  );
}

// Una "GroupOrTask" es una tarea suelta o un grupo (parent + children).
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

  // Construir map parent_id → children
  const childrenByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id) {
      const arr = childrenByParent.get(t.parent_task_id) || [];
      arr.push(t);
      childrenByParent.set(t.parent_task_id, arr);
    }
  }

  // Una tarea es "grupo" si es padre (no tiene parent_task_id) y tiene hijos.
  const items: { item: GroupOrTask; bucket: keyof Groups }[] = [];

  for (const t of tasks) {
    if (t.parent_task_id) continue; // hijos se procesan dentro del grupo

    const kids = childrenByParent.get(t.id) || [];
    if (kids.length > 0) {
      // Grupo: clasificar según el estado AGREGADO de los hijos
      const allDone = kids.every(k => k.status === 'done');
      const item: GroupOrTask = { kind: 'group', parent: t, children: kids };
      if (allDone) {
        items.push({ item, bucket: 'done' });
      } else {
        // Buscar si algún hijo está vencido o esta semana
        const pendingKids = kids.filter(k => k.status !== 'done');
        const hasOverdue = pendingKids.some(k => k.due_date && new Date(k.due_date) < now);
        const hasThisWeek = pendingKids.some(k => k.due_date && new Date(k.due_date) <= weekEnd);
        if (hasOverdue) items.push({ item, bucket: 'overdue' });
        else if (hasThisWeek) items.push({ item, bucket: 'thisWeek' });
        else items.push({ item, bucket: 'undated' });
      }
    } else {
      // Tarea suelta sin grupo
      const taskItem: GroupOrTask = { kind: 'task', task: t };
      if (t.status === 'done') {
        items.push({ item: taskItem, bucket: 'done' });
      } else if (!t.due_date) {
        items.push({ item: taskItem, bucket: 'undated' });
      } else {
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
  title, groups, childById, parentById, onToggle, onToggleCollapse, collapsed, accent, muted,
}: {
  title: string;
  groups: GroupOrTask[];
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  onToggleCollapse: (id: string) => void;
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
              <SingleTaskRow
                key={g.task.id}
                task={g.task}
                childById={childById}
                parentById={parentById}
                onToggle={onToggle}
                muted={muted}
              />
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

function SingleTaskRow({
  task, childById, parentById, onToggle, muted,
}: {
  task: Task;
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  muted?: boolean;
}) {
  return (
    <div className="list-group">
      <TaskRow task={task} childById={childById} parentById={parentById} onToggle={onToggle} muted={muted} />
    </div>
  );
}

function GroupCard({
  parent, childrenTasks, childById, parentById, onToggle, isCollapsed, onToggleCollapse, muted,
}: {
  parent: Task;
  childrenTasks: Task[];
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  muted?: boolean;
}) {
  const total = childrenTasks.length;
  const done = childrenTasks.filter(c => c.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={`card p-0 overflow-hidden ${muted ? 'opacity-65' : ''}`}>
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-3 px-4 py-3 tap-highlight focus-ring text-left"
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
        {isCollapsed ? (
          <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--text-quaternary)]" />
        )}
      </button>
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
  task, childById, parentById, onToggle, muted, indent,
}: {
  task: Task;
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  muted?: boolean;
  indent?: boolean;
}) {
  const child = childById(task.child_id);
  const assignee = parentById(task.assigned_to);
  const isDone = task.status === 'done';
  return (
    <div className={`list-row ${muted && !indent ? 'opacity-65' : ''}`} style={indent ? { paddingLeft: '24px' } : undefined}>
      <button
        onClick={() => onToggle(task)}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 focus-ring"
      >
        {isDone
          ? <CheckCircle2 size={22} className="text-[var(--success)]" />
          : <Circle size={22} className="text-[var(--text-quaternary)]" />}
      </button>
      <div className="flex-1 min-w-0">
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
      </div>
    </div>
  );
}
