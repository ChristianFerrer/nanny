/**
 * Helpers para agrupar tareas bajo su parent (paraguas) compartidos por
 * /tareas y /hoy. La regla:
 *
 *  - Una tarea con parent_task_id = null Y al menos una tarea con
 *    parent_task_id = t.id es un GRUPO (paraguas + sub-actividades).
 *  - Las sub-actividades nunca se renderizan sueltas: viven dentro del grupo.
 *  - El grupo siempre incluye TODAS las hijas (completadas + pendientes) para
 *    que el usuario tenga la foto completa.
 *  - Una tarea sin parent_task_id Y sin hijas es una tarea SUELTA.
 */

import type { Task } from './types';

export type TaskGroup = {
  parent: Task;
  children: Task[];
  done: number;
  total: number;
  pct: number; // 0-100
  hasOverdue: boolean;
  hasPendingThisWeek: boolean;
  allDone: boolean;
};

export type GroupOrTask =
  | { kind: 'task'; task: Task }
  | { kind: 'group'; group: TaskGroup };

/**
 * Convierte un array plano de tareas en una lista de items donde:
 *  - Cada parent con hijas pasa a un item `group`
 *  - Cada tarea suelta pasa a un item `task`
 *  - Las hijas no aparecen como items independientes (viven dentro del grupo)
 */
export function buildGroupedTasks(tasks: Task[]): GroupOrTask[] {
  const childrenByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_task_id) {
      const arr = childrenByParent.get(t.parent_task_id) || [];
      arr.push(t);
      childrenByParent.set(t.parent_task_id, arr);
    }
  }

  const now = new Date();
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);

  const items: GroupOrTask[] = [];
  for (const t of tasks) {
    if (t.parent_task_id) continue; // hijas no van como items sueltos
    const kids = childrenByParent.get(t.id);
    if (kids && kids.length > 0) {
      const done = kids.filter(k => k.status === 'done').length;
      const total = kids.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const allDone = done === total;
      const pendingKids = kids.filter(k => k.status !== 'done');
      const hasOverdue = pendingKids.some(k => k.due_date && new Date(k.due_date) < now);
      const hasPendingThisWeek = pendingKids.some(k => k.due_date && new Date(k.due_date) <= weekEnd);
      // Ordenar hijas: pendientes primero, completadas al final.
      const sorted = [...kids].sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        // dentro de cada grupo, por fecha ascendente
        const da = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return da - db;
      });
      items.push({
        kind: 'group',
        group: { parent: t, children: sorted, done, total, pct, hasOverdue, hasPendingThisWeek, allDone },
      });
    } else {
      items.push({ kind: 'task', task: t });
    }
  }
  return items;
}

/**
 * Filtra los items agrupados por relevancia para "Hoy":
 *  - Tareas sueltas pendientes (status != done) con due_date <= hoy o sin fecha
 *  - Grupos con al menos una hija pendiente
 *
 * Las completadas no se muestran en Hoy (solo en /tareas → "Completadas").
 */
export function filterForToday(items: GroupOrTask[]): GroupOrTask[] {
  return items.filter(item => {
    if (item.kind === 'task') {
      return item.task.status !== 'done' && item.task.status !== 'cancelled';
    }
    return !item.group.allDone;
  });
}
