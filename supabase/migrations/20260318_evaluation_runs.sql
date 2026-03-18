-- Tabla para almacenar resultados de evaluaciones automáticas de Nanny
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt_version TEXT NOT NULL DEFAULT 'current',
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  conversation_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  aggregate_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_conversations INTEGER NOT NULL DEFAULT 0,
  perfect_conversations INTEGER NOT NULL DEFAULT 0,
  partial_conversations INTEGER NOT NULL DEFAULT 0,
  failed_conversations INTEGER NOT NULL DEFAULT 0,
  total_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas por fecha
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_timestamp ON evaluation_runs (timestamp DESC);

-- RLS: solo accesible por service role (admin)
ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;

-- No RLS policies = solo accesible con service_role key (API routes)
