-- Permite agrupar tareas bajo una tarea "paraguas" (ej. "Cumpleaños Pau" como
-- parent, con 4 sub-actividades: invitación, reserva del salón, decoración,
-- sorpresitas). El padre tiene parent_task_id NULL; los hijos apuntan a su id.
--
-- La UI agrupa visualmente las tareas por parent (cuando existe).
-- Status del padre se computa derivado de los hijos (todos done → padre done).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
