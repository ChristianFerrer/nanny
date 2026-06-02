-- Tabla singleton para persistir las reglas adicionales del pipeline
-- Antes vivían en memoria (módulo JS), lo cual se pierde entre invocaciones
-- serverless. Esto rompe el autopilot: las reglas agregadas en la fase
-- `diagnosis` no estaban disponibles cuando el cron corría `reeval` en una
-- instancia diferente.
--
-- Diseño: una sola fila (id=1) con todo el estado. Cualquier caller actualiza
-- esta fila con upsert. El código cachea en memoria con TTL corto para no
-- pegarle a Supabase en cada mensaje de chat.
CREATE TABLE IF NOT EXISTS prompt_rules_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot JSONB,
  version_counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fila singleton inicial
INSERT INTO prompt_rules_state (id, active_rules, snapshot, version_counter)
VALUES (1, '[]'::jsonb, NULL, 0)
ON CONFLICT (id) DO NOTHING;

-- RLS: solo accesible por service role (admin/server)
ALTER TABLE prompt_rules_state ENABLE ROW LEVEL SECURITY;
