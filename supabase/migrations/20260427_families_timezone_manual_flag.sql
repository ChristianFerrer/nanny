-- Flag para distinguir si la zona horaria de la familia fue elegida MANUALMENTE
-- por el usuario (en /perfil) o si fue auto-detectada / quedó en el default.
--
-- Razón: el cliente auto-detecta `Intl.DateTimeFormat().resolvedOptions().timeZone`
-- y silenciosamente actualiza `families.timezone` cuando hay mismatch — pero
-- solo si `timezone_set_manually = false`. Una vez que el usuario edita la TZ
-- en /perfil, el flag se vuelve true y el auto-detect deja de pisarlo.

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS timezone_set_manually BOOLEAN NOT NULL DEFAULT false;
