-- Tabla `family_learning_queue`: cola de cosas que Nanny quiere aprender
-- sobre la familia. Alimentada automáticamente cuando se detecta info
-- faltante (ej: "pediatra" mencionado sin estar en contactos).
--
-- Política: máximo 1 pregunta de aprendizaje por día por familia. El
-- decision agent revisa esta cola cuando despierta y, si el contexto es
-- natural, hace UNA pregunta.

CREATE TABLE IF NOT EXISTS family_learning_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,            -- ej: "pediatra_name", "usual_pickup_pattern", "abuela_phone"
  urgency TEXT NOT NULL DEFAULT 'low' CHECK (urgency IN ('low', 'medium', 'high')),
  context_required JSONB DEFAULT '{}'::jsonb, -- condiciones que disparan preguntar
  question_text TEXT,             -- redacción sugerida de la pregunta (la genera Nanny)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'asked', 'resolved', 'cancelled')),
  asked_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_queue_family_pending
  ON family_learning_queue(family_id, urgency DESC, created_at)
  WHERE status = 'pending';

ALTER TABLE family_learning_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own family learning queue"
  ON family_learning_queue
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  );

-- Solo el servidor (admin client) escribe a esta tabla — los padres no la
-- manipulan directamente. Por eso no hay policy de INSERT/UPDATE/DELETE
-- para el rol authenticated.
