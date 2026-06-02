-- Tabla `medication_intakes`: registra cada toma individual de un tratamiento.
--
-- Modelo: una fila por horario programado de cada día de tratamiento.
-- Permite ver historial real de "tomas realizadas" vs planificadas en la
-- página de detalle del tratamiento (/tratamiento/[id]).
--
-- Ciclo de vida: las filas pueden crearse perezosamente cuando el padre
-- abre el detalle (UI compone el grid programado a partir de start_date +
-- schedule_times + duration_days y persiste solo las tomas con cambio de
-- estado). status='pending' es el default lógico aunque no se materialice.

CREATE TABLE IF NOT EXISTS medication_intakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'missed', 'skipped')),
  taken_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES parents(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (medication_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_medication_intakes_medication
  ON medication_intakes(medication_id);
CREATE INDEX IF NOT EXISTS idx_medication_intakes_family
  ON medication_intakes(family_id);
CREATE INDEX IF NOT EXISTS idx_medication_intakes_scheduled
  ON medication_intakes(scheduled_at);
