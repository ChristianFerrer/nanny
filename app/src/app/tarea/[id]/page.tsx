'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { getTasks, getChildren, getParents, getCachedSnapshot, updateTask, deleteTask } from '@/lib/store';
import type { Task, Child, Parent } from '@/lib/types';

export default function TareaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const _snap = getCachedSnapshot();

  const [task, setTask] = useState<Task | null>(() => _snap?.tasks.find(t => t.id === id) || null);
  const [allTasks, setAllTasks] = useState<Task[]>(_snap?.tasks || []);
  const [parents, setParents] = useState<Parent[]>(_snap?.parents || []);
  const [children, setChildren] = useState<Child[]>(_snap?.children || []);
  const [loading, setLoading] = useState(!_snap);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState(task?.title || '');
  const [assignedTo, setAssignedTo] = useState<string | null>(task?.assigned_to ?? null);
  const [childId, setChildId] = useState<string | null>(task?.child_id ?? null);
  const [dueDate, setDueDate] = useState(task?.due_date ? task.due_date.split('T')[0] : '');
  const [status, setStatus] = useState<Task['status']>(task?.status || 'pending');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [t, p, c] = await Promise.all([getTasks(), getParents(), getChildren()]);
      setAllTasks(t);
      setParents(p);
      setChildren(c);
      const found = t.find(x => x.id === id) || null;
      if (!found) {
        setNotFound(true);
      } else {
        setTask(found);
        setTitle(found.title);
        setAssignedTo(found.assigned_to);
        setChildId(found.child_id);
        setDueDate(found.due_date ? found.due_date.split('T')[0] : '');
        setStatus(found.status);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isParent = task ? !task.parent_task_id && allTasks.some(t => t.parent_task_id === task.id) : false;
  const childCount = task && isParent ? allTasks.filter(t => t.parent_task_id === task.id).length : 0;

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    const updates: Partial<Task> = {
      title: title.trim(),
      assigned_to: assignedTo,
      child_id: childId,
      due_date: dueDate ? new Date(dueDate + 'T00:00:00').toISOString() : null,
      status,
      completed_at: status === 'done' && task.status !== 'done' ? new Date().toISOString() : (status !== 'done' ? null : task.completed_at),
    };
    await updateTask(task.id, updates);
    setSaving(false);
    router.back();
  };

  const handleDelete = async () => {
    if (!task) return;
    await deleteTask(task.id);
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter">
        <header className="px-5 pt-header pb-4">
          <div className="skeleton size-9 rounded-full mb-3" />
          <div className="skeleton h-7 w-48" />
        </header>
        <div className="px-5 space-y-4">
          <div className="skeleton h-10 w-full rounded-xl" />
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !task) {
    return (
      <div className="min-h-dvh bg-white pb-24 page-enter px-5 pt-header">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight mb-4"
        >
          <ArrowLeft size={26} />
        </button>
        <p className="text-headline">Tarea no encontrada</p>
        <p className="text-footnote text-[var(--text-tertiary)] mt-1 text-pretty">Puede que haya sido eliminada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] pb-24 page-enter">
      <header className="px-5 pt-header pb-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="size-10 -ml-2 rounded-full flex items-center justify-center text-[var(--text-secondary)] focus-ring tap-highlight"
        >
          <ArrowLeft size={26} />
        </button>
      </header>

      <div className="px-5">
        <h1 className="text-large-title text-[var(--text-primary)] text-balance">
          {isParent ? 'Tarea paraguas' : 'Editar tarea'}
        </h1>
      </div>

      <div className="px-5 mt-4 space-y-4">
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
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} />
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
            <p role="alert" className="text-footnote text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-[var(--danger)]" />
              {isParent ? `Se borrarán ${childCount} sub-actividades junto con el grupo. ¿Confirmás?` : '¿Eliminar esta tarea?'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm flex-1">Cancelar</button>
              <button autoFocus onClick={handleDelete} className="btn btn-destructive btn-sm flex-1">Eliminar</button>
            </div>
          </div>
        )}
      </div>
    </div>
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
