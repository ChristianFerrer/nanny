-- Tabla `decision_agent_log`: trace de cada despertar del decision agent.
-- Permite diagnóstico, observación de costos, y validación cualitativa de
-- los 7 casos fundacionales (NANNY-VISION.md §9).
--
-- Cada fila representa UN ciclo del decision agent:
--   trigger_type='scheduled'   → cron despertó por el reloj semántico (07/12:30/17/21)
--   trigger_type='message'     → llegó mensaje al chat (event-triggered)
--   trigger_type='manual'      → invocación manual (debug, replay)
--
-- model_response guarda el JSON crudo devuelto por Claude para poder rehacer
-- el análisis sin re-invocar el modelo. cost_usd se calcula con los tokens
-- reportados por Anthropic (input, input_cache_read, input_cache_create,
-- output).

CREATE TABLE IF NOT EXISTS decision_agent_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,

  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'message', 'manual')),
  trigger_moment TEXT, -- 'morning' | 'midday' | 'afternoon' | 'evening' | null
  trigger_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,

  context_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- snapshot de tamaños de cada bloque: { events: 3, tasks: 1, recent_messages: 12, patterns: 0, ... }
  -- útil para auditar qué contexto recibió el modelo sin guardar todo el texto

  decision JSONB NOT NULL,
  -- el output tipado DecisionAgentOutput:
  -- { intervene, message, delivery, delivery_target_contact_id, priority, reason }

  model_response JSONB,
  -- raw response del modelo: { model, stop_reason, usage: {...}, content: [...] }

  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_log_family_created
  ON decision_agent_log(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_log_trigger
  ON decision_agent_log(family_id, trigger_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_log_intervene
  ON decision_agent_log(family_id, created_at DESC)
  WHERE (decision->>'intervene')::boolean = TRUE;

ALTER TABLE decision_agent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own family decision log"
  ON decision_agent_log
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  );

-- Solo el servidor (admin client) escribe — los padres no manipulan
-- el log directamente. No hay policy de INSERT/UPDATE/DELETE para authenticated.
