'use client';

/**
 * Renderer compartido para listas de tareas con agrupación.
 *
 * Usado por /tareas y /hoy para mostrar la misma estructura visual:
 *   - Tareas sueltas como filas individuales
 *   - Tareas paraguas como cards con barra de progreso + sub-actividades
 *     indentadas (todas, completadas + pendientes)
 *
 * Este componente NO maneja secciones/buckets (Vencidas/Esta semana/etc).
 * Lo deja al caller, que pasa el array ya filtrado.
 */

import { Circle, CheckCircle2, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type { Task, Child, Parent } from '@/lib/types';
import type { GroupOrTask } from '@/lib/task-grouping';

export interface TaskListProps {
  items: GroupOrTask[];
  children: Child[];
  parents: Parent[];
  collapsedGroups: Set<string>;
  onToggle: (t: Task) => void;
  onEdit?: (t: Task) => void;
  onToggleCollapse: (groupId: string) => void;
  muted?: boolean;
}

export function TaskList({
  items, children, parents, collapsedGroups, onToggle, onEdit, onToggleCollapse, muted,
}: TaskListProps) {
  const childById = (id: string | null) => id ? children.find(c => c.id === id) : null;
  const parentById = (id: string | null) => id ? parents.find(p => p.id === id) : null;

  return (
    <div className="space-y-2">
      {items.map(item => {
        if (item.kind === 'task') {
          return (
            <div key={item.task.id} className="list-group">
              <TaskRow task={item.task} childById={childById} parentById={parentById} onToggle={onToggle} onEdit={onEdit} muted={muted} />
            </div>
          );
        }
        const isCollapsed = collapsedGroups.has(item.group.parent.id);
        return (
          <GroupCard
            key={item.group.parent.id}
            group={item.group}
            childById={childById}
            parentById={parentById}
            onToggle={onToggle}
            onEdit={onEdit}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => onToggleCollapse(item.group.parent.id)}
            muted={muted}
          />
        );
      })}
    </div>
  );
}

function GroupCard({
  group, childById, parentById, onToggle, onEdit, isCollapsed, onToggleCollapse, muted,
}: {
  group: { parent: Task; children: Task[]; done: number; total: number; pct: number };
  childById: (id: string | null) => Child | null | undefined;
  parentById: (id: string | null) => Parent | null | undefined;
  onToggle: (t: Task) => void;
  onEdit?: (t: Task) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  muted?: boolean;
}) {
  const { parent, children: kids, done, total, pct } = group;
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
        {onEdit && (
          <button
            onClick={() => onEdit(parent)}
            className="px-3 hover:bg-[var(--gray-50)] focus-ring border-l border-[var(--separator)]"
            aria-label="Editar grupo"
          >
            <span className="text-caption text-[var(--nanny-purple)] font-semibold">Editar</span>
          </button>
        )}
      </div>
      <div className="h-1 bg-[var(--gray-100)]">
        <div className="h-full bg-[var(--nanny-purple)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      {!isCollapsed && (
        <div className="border-t border-[var(--separator)]">
          {kids.map(child => (
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
  onEdit?: (t: Task) => void;
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
        onClick={() => onEdit?.(task)}
        className="flex-1 min-w-0 text-left tap-highlight focus-ring rounded-lg py-1 -my-1 px-1"
        disabled={!onEdit}
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
