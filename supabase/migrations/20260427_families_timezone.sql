-- Agrega zona horaria por familia para que el cron de "morning brief" pueda
-- enviar el resumen ~8am en horario LOCAL de cada familia, no en un horario
-- global UTC.
--
-- Default 'America/Argentina/Buenos_Aires' (GMT-3) por la base de usuarios
-- temprana (LATAM). Editable desde /perfil → Configuración.
--
-- Lista de TZ válidas: tz database (IANA) — ej. 'America/Mexico_City',
-- 'America/Bogota', 'America/Santiago', 'Europe/Madrid'.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';
