-- Agrega locking + heartbeat al tracking de autopilot jobs.
--
-- `locked_until`: cuando un worker entra a procesar una unidad, hace
-- compare-and-swap sobre este campo para evitar que POST inline y Vercel
-- Cron procesen el mismo job en paralelo (lo cual corrompía
-- `current_conversation` y saltaba conversaciones).
--
-- `last_heartbeat`: actualizado en cada unit procesada. Permite detectar
-- jobs colgados con precisión de segundos (antes solo se usaba updated_at
-- con lógica duplicada en 3 lugares).
ALTER TABLE autopilot_jobs
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- Inicializar heartbeat para jobs existentes
UPDATE autopilot_jobs
SET last_heartbeat = updated_at
WHERE last_heartbeat IS NULL;

-- Index para buscar jobs que necesitan ser tomados por el cron
CREATE INDEX IF NOT EXISTS idx_autopilot_jobs_claim
  ON autopilot_jobs (status, locked_until)
  WHERE status = 'running';
