-- Tabla para rastrear el estado de jobs de autopilot
-- Permite que el pipeline se ejecute en chunks (una conversación por request)
-- y que el cliente vea el progreso real desde cualquier dispositivo
CREATE TABLE IF NOT EXISTS autopilot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  phase TEXT NOT NULL DEFAULT 'evaluation',
  current_conversation INTEGER NOT NULL DEFAULT 0,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT '',

  -- Resultados parciales de cada conversación (se van acumulando)
  conversation_scores JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Resultado final
  eval_run_id UUID REFERENCES evaluation_runs(id),
  aggregate_scores JSONB,

  -- Diagnóstico y ajustes
  diagnosis_summary TEXT,
  adjustments_applied INTEGER DEFAULT 0,

  -- Re-evaluación
  reeval_pre_score NUMERIC,
  reeval_post_score NUMERIC,
  reeval_improved BOOLEAN,
  reeval_rolled_back BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para buscar jobs activos
CREATE INDEX IF NOT EXISTS idx_autopilot_jobs_status ON autopilot_jobs (status, created_at DESC);

-- RLS: solo accesible por service role (admin)
ALTER TABLE autopilot_jobs ENABLE ROW LEVEL SECURITY;
