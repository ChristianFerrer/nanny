-- Tabla `family_preferences`: preferencias y sensibilidades explícitas de la
-- familia. Mayor prioridad que patrones inferidos — siempre se aplican.
--
-- Capturadas cuando un padre las dice ("no me hables del cumple, lo manejo
-- yo") o cuando Nanny es corregida ("no, eso lo hago yo").

CREATE TABLE IF NOT EXISTS family_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL, -- 'topic_avoid' | 'time_window' | 'name_alias' | 'notification_preference' | 'parent_role_assignment' | 'other'
  content TEXT NOT NULL,         -- ej: "No mencionar cumpleaños de Pau, lo maneja Sofía"
  applies_to_child_id UUID REFERENCES children(id) ON DELETE CASCADE, -- nullable: si aplica a un hijo específico
  applies_to_parent_id UUID REFERENCES parents(id) ON DELETE CASCADE, -- nullable: si aplica a un padre específico
  source TEXT NOT NULL DEFAULT 'explicit', -- 'explicit' | 'correction' | 'inferred'
  active BOOLEAN NOT NULL DEFAULT TRUE,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_preferences_family
  ON family_preferences(family_id) WHERE active = TRUE;

ALTER TABLE family_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family preferences"
  ON family_preferences
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
