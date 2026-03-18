-- Tabla para versionar el system prompt de Nanny
-- Permite aplicar ajustes desde el diagnóstico AI sin redeploy

CREATE TABLE IF NOT EXISTS system_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version_label TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  parent_version_id UUID REFERENCES system_prompts(id),
  change_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Solo un prompt activo a la vez
CREATE UNIQUE INDEX idx_system_prompts_active
  ON system_prompts (is_active)
  WHERE is_active = true;

-- Índice para buscar el activo rápidamente
CREATE INDEX idx_system_prompts_created ON system_prompts (created_at DESC);
