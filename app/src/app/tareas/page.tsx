'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Circle, CheckCircle2, Sparkles } from 'lucide-react';
import { getTasks, getChildren, getParents, completeTask, uncompleteTask, getCachedSnapshot } from '@/lib/store';
import type { Task, Child, Parent } from '@/lib/types';

export default function TareasPage() {
  const _snap = getCachedSnapshot();
  const [tasks, setTasks] = useState<Task[]>(_snap?.tasks || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [loading, setLoading] = useState(!_snap);

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

  const groups = groupTasks(tasks);

  const childById = (id: string | null) => id ? children.find(c => c.id === id) : null;
  const parentById = (id: string | null) => id ? parents.find(p => p.id === id) : null;

  const toggle = async (t: Task) => {
    if (t.status === 'done') {
      await uncompleteTask(t.id);
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'pending' } : x));
    } else {
      await completeTask(t.id);
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: 'done' } : x));
    }
  };

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
            <Section title="Vencidas" tasks={groups.overdue} childById={childById} parentById={parentById} onToggle={toggle} accent="var(--warning)" />
            <Section title="Esta semana" tasks={groups.thisWeek} childById={childById} parentById={parentById} onToggle={toggle} />
            <Section title="Sin fecha" tasks={groups.undated} childById={childById} parentById={parentById} onToggle={toggle} />
            <Section title="Completadas" tasks={groups.done} childById={childById} parentById={parentById} onToggle={toggle} muted />
          </>
        )}
      </div>
    </div>
  );
}

type Groups = { overdue: Task[]; thisWeek: Task[]; undated: Task[]; done: Task[] };

function groupTasks(tasks: Task[]): Groups {
  const now = new Date();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const overdue: Task[] = [], thisWeek: Task[] = [], undated: Task[] = [], done: Task[] = [];
  for (const t of tasks) {
    if (t.status === 'done') { done.push(t); continue; }
    if (!t.due_date) { undated.push(t); continue; }
    const due = new Date(t.due_date);
    if (due < now) overdue.push(t);
    else if (due <= weekEnd) thisWeek.push(t);
    else undated.push(t);
  }
  return { overdue, thisWeek, undated, done };
}

function Section({
  title, tasks, childById, parentById, onToggle, accent, muted,
}: {
  title: string;
  tasks: Task[];
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  accent?: string;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <h2 className="text-caption mb-2 px-1 uppercase tracking-wider" style={{ color: accent || 'var(--text-tertiary)' }}>
        {title} {tasks.length > 0 && <span className="text-[var(--text-quaternary)] font-normal">· {tasks.length}</span>}
      </h2>
      <div className="list-group">
        {tasks.map(t => {
          const child = childById(t.child_id);
          const assignee = parentById(t.assigned_to);
          const isDone = t.status === 'done';
          return (
            <div key={t.id} className={`list-row ${muted ? 'opacity-65' : ''}`}>
              <button
                onClick={() => onToggle(t)}
                aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 focus-ring"
              >
                {isDone
                  ? <CheckCircle2 size={22} className="text-[var(--success)]" />
                  : <Circle size={22} className="text-[var(--text-quaternary)]" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-subhead truncate ${isDone ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                  {t.title}
                </p>
                <p className="text-footnote text-[var(--text-tertiary)] truncate">
                  {[
                    t.due_date ? new Date(t.due_date).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : null,
                    child ? child.name : null,
                    assignee ? assignee.name : null,
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
