-- Cleanup: hijos creados antes del fix del bug `emoji: childColor` (introducido
-- en el rediseño Apple-inspired) tienen un código hex como `#7C3AED` guardado
-- en la columna `emoji`. Eso contamina el contexto del AI en el chat
-- ("Familia: Juan (#7C3AED, 5 años…)") y puede romper renders donde se asume
-- que `emoji` es un grafema corto.
--
-- Esta migración:
--   1) Mueve el valor hex actual de `emoji` a `color` (cuando aplica) si la
--      columna `color` está vacía.
--   2) Resetea `emoji` al default '👶' para esos registros.
--
-- Es idempotente: si `emoji` ya es un emoji real o `color` ya tiene valor,
-- no hace nada.

UPDATE children
SET
  color = COALESCE(color, emoji),
  emoji = '👶'
WHERE emoji ~ '^#[0-9A-Fa-f]{6}$';
