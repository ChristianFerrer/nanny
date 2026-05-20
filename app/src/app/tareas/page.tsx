'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Settings } from 'lucide-react';
import { getTasks, getChildren, getParents, completeTask, uncompleteTask, getCachedSnapshot, invalidateTableCache } from '@/lib/store';
import { useRealtimeFamily } from '@/lib/realtime';
import { buildGroupedTasks, type GroupOrTask } from '@/lib/task-grouping';
import { TaskList } from '@/components/TaskList';
import type { Task, Child, Parent } from '@/lib/types';

export default function TareasPage() {
  const _snap = getCachedSnapshot();
  const router = useRouter();
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

  // Real-time sync: refrescar la lista cuando otro padre marca/completa/agrega tareas.
  const familyId = _snap?.family?.id || '';
  useRealtimeFamily({
    familyId,
    tables: ['tasks'],
    enabled: !!familyId,
    onChange: () => {
      invalidateTableCache('tasks');
      loadData();
    },
  });

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

  const goToTask = (t: Task) => router.push(`/tarea/${t.id}`);

  const items = buildGroupedTasks(tasks);
  const sections = bucketize(items);

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-header pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-large-title text-[var(--text-primary)] text-balance">Tareas</h1>
          <p className="text-footnote text-[var(--text-tertiary)] mt-0.5">
            Pendientes con y sin fecha
          </p>
        </div>
        <Link
          href="/perfil"
          aria-label="Configuración"
          className="size-10 mt-1 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--gray-100)] focus-ring"
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
            <div className="size-12 mx-auto rounded-2xl bg-[var(--nanny-purple-tint)] flex items-center justify-center mb-3">
              <Sparkles size={22} className="text-[var(--nanny-purple)]" />
            </div>
            <p className="text-subhead text-[var(--text-primary)]">Todo al día</p>
            <p className="text-footnote text-[var(--text-tertiary)] mt-1 text-pretty">
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
              <TaskList items={sections.overdue} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={goToTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Esta semana" count={sections.thisWeek.length} />
            {sections.thisWeek.length > 0 && (
              <TaskList items={sections.thisWeek} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={goToTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Sin fecha" count={sections.undated.length} />
            {sections.undated.length > 0 && (
              <TaskList items={sections.undated} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={goToTask} onToggleCollapse={toggleCollapse} />
            )}
            <SectionLabel title="Completadas" count={sections.done.length} />
            {sections.done.length > 0 && (
              <TaskList items={sections.done} children={children} parents={parents} collapsedGroups={collapsedGroups} onToggle={toggle} onEdit={goToTask} onToggleCollapse={toggleCollapse} muted />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ title, count, accent }: { title: string; count: number; accent?: string }) {
  if (count === 0) return null;
  return (
    <h2 className="text-caption mb-2 px-1 uppercase tracking-wider text-balance" style={{ color: accent || 'var(--text-tertiary)' }}>
      {title} <span className="text-[var(--text-quaternary)] font-normal tabular-nums">· {count}</span>
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

