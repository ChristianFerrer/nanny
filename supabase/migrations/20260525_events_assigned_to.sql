-- Responsable (mamá/papá) asignado a un evento. Hasta ahora solo `tasks` tenía
-- assigned_to; el assistant y el morning-brief ya escribían/leían events.assigned_to
-- sin que la columna existiera en el schema canónico. Idempotente.
ALTER TABLE events ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES parents(id);
CREATE INDEX IF NOT EXISTS idx_events_assigned ON events(assigned_to);
