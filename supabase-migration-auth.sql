-- ============================================================
-- MIGRACIÓN: De "Allow all MVP" a Auth con aislamiento por familia
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Habilitar Auth por email/password (esto se hace en Dashboard → Authentication → Providers)
--    Asegúrate de tener habilitado el provider "Email" con "Confirm email" desactivado para MVP.

-- ============================================================
-- PASO 1: Eliminar las policies MVP abiertas
-- ============================================================

DROP POLICY IF EXISTS "Allow all for MVP" ON families;
DROP POLICY IF EXISTS "Allow all for MVP" ON parents;
DROP POLICY IF EXISTS "Allow all for MVP" ON children;
DROP POLICY IF EXISTS "Allow all for MVP" ON events;
DROP POLICY IF EXISTS "Allow all for MVP" ON tasks;
DROP POLICY IF EXISTS "Allow all for MVP" ON messages;
DROP POLICY IF EXISTS "Allow all for MVP" ON pending_confirmations;
DROP POLICY IF EXISTS "Allow all for MVP" ON routines;
DROP POLICY IF EXISTS "Allow all for MVP" ON intervention_feedback;

-- ============================================================
-- PASO 2: Crear nuevas policies con aislamiento por familia
-- ============================================================

-- FAMILIES
CREATE POLICY "Users can view own family" ON families
  FOR ALL USING (
    id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (true);

CREATE POLICY "Allow insert families" ON families
  FOR INSERT WITH CHECK (true);

-- PARENTS
CREATE POLICY "Users can manage own family parents" ON parents
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents p WHERE p.auth_user_id = auth.uid())
  )
  WITH CHECK (true);

CREATE POLICY "Allow insert parents" ON parents
  FOR INSERT WITH CHECK (true);

-- CHILDREN
CREATE POLICY "Users can manage own family children" ON children
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (true);

CREATE POLICY "Allow insert children" ON children
  FOR INSERT WITH CHECK (true);

-- EVENTS
CREATE POLICY "Users can manage own family events" ON events
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

-- TASKS
CREATE POLICY "Users can manage own family tasks" ON tasks
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

-- MESSAGES
CREATE POLICY "Users can manage own family messages" ON messages
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

-- PENDING_CONFIRMATIONS
CREATE POLICY "Users can manage own family confirmations" ON pending_confirmations
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

-- ROUTINES
CREATE POLICY "Users can manage own family routines" ON routines
  FOR ALL USING (
    child_id IN (
      SELECT c.id FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    child_id IN (
      SELECT c.id FROM children c
      JOIN parents p ON p.family_id = c.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- INTERVENTION_FEEDBACK
CREATE POLICY "Users can manage own family feedback" ON intervention_feedback
  FOR ALL USING (
    message_id IN (
      SELECT m.id FROM messages m
      JOIN parents p ON p.family_id = m.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    message_id IN (
      SELECT m.id FROM messages m
      JOIN parents p ON p.family_id = m.family_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- LISTO! Ahora cada familia solo puede ver sus propios datos.
-- ============================================================
