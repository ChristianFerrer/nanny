-- Agrega la columna `color` a la tabla `children` para soportar la feature
-- de color del avatar introducida en el rediseño Apple-inspired (perfil del
-- niño, lista de hijos y detalle de hijo). El picker en /perfil permite elegir
-- entre 6 colores hex; el valor se usa como `background` del avatar.
--
-- Nullable: los hijos creados antes de esta migración no tienen color y
-- la UI cae a `var(--nanny-purple)` como fallback.

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS color TEXT;
