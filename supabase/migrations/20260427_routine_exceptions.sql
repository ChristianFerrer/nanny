-- Tabla `routine_exceptions`: overrides puntuales de una rutina semanal.
--
-- Una rutina (`routines`) describe el horario semanal estable: ej. "guardería
-- de Pau, lunes a viernes 09:00-17:00". Cuando un padre dice "el viernes no
-- hay guardería" o "este miércoles entra a las 11", se crea una excepción
-- para ESA fecha específica, dejando intacta la rutina general.
--
-- Estado actual: solo soporta cancelación (`cancelled = true`). Se dejan los
-- campos `time_start_override` / `time_end_override` para futuro override de
-- horario sin cancelación, sin necesidad de migrar.

CREATE TABLE IF NOT EXISTS routine_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  cancelled BOOLEAN NOT NULL DEFAULT TRUE,
  time_start_override TIME,
  time_end_override TIME,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (routine_id, date)
);

CREATE INDEX IF NOT EXISTS idx_routine_exceptions_routine
  ON routine_exceptions(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_exceptions_date
  ON routine_exceptions(date);

ALTER TABLE routine_exceptions ENABLE ROW LEVEL SECURITY;

-- Acceso vía la cadena routine_exception → routine → child → parent.
CREATE POLICY "Users can manage own family routine_exceptions"
  ON routine_exceptions
  FOR ALL USING (
    routine_id IN (
      SELECT r.id FROM routines r
      JOIN children c ON c.id = r.child_id
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    routine_id IN (
      SELECT r.id FROM routines r
      JOIN children c ON c.id = r.child_id
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  );
