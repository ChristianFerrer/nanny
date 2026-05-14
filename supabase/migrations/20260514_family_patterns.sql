-- Tabla `family_patterns`: memoria semántica de patrones detectados en la
-- familia. Alimenta al decision agent para que Nanny pueda actuar con
-- contexto histórico ("Christian suele llevar al pediatra", "Pau no quiere
-- ir al dentista").
--
-- Política: cada patrón tiene `confidence` (0-1) actualizada por el memory
-- updater diario. confidence ≥ 0.7 se aplica + verbaliza; 0.5-0.7 pregunta
-- antes de aplicar; < 0.5 se ignora.

CREATE TABLE IF NOT EXISTS family_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL, -- 'parent_responsibility' | 'child_preference' | 'recurring_event' | 'time_window' | 'other'
  description TEXT NOT NULL,  -- ej: "Christian suele llevar a Pau al pediatra"
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source_message_ids UUID[] DEFAULT '{}', -- ids de messages que informaron este patrón
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_patterns_family
  ON family_patterns(family_id);

CREATE INDEX IF NOT EXISTS idx_family_patterns_confidence
  ON family_patterns(family_id, confidence DESC);

ALTER TABLE family_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family patterns"
  ON family_patterns
  USING (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  );
