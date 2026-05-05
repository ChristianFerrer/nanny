-- Tabla `notifications_sent`: registra los push proactivos enviados para evitar
-- duplicados cuando el cron de upcoming-reminders corre cada N minutos.
--
-- Modelo: una fila por (entity_type, entity_id) — único, idempotente. Si el
-- cron procesa el mismo evento o toma 2 veces, el insert hace conflict y se
-- skipea sin re-enviar push.
--
-- Ciclo de vida: las filas no se borran. Si en el futuro se quiere re-notificar
-- un evento (ej. el padre lo movió) se puede borrar la fila correspondiente o
-- agregar una columna `kind` para distinguir tipos de aviso.

CREATE TABLE IF NOT EXISTS notifications_sent (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'medication_intake')),
  entity_id UUID NOT NULL,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_family
  ON notifications_sent(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at
  ON notifications_sent(notified_at);

-- Sin RLS por ahora: solo el admin client del cron escribe acá. Si el cliente
-- browser empezara a leer esta tabla, agregar la política.
