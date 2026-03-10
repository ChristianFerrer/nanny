-- ============================================================
-- NANNY MVP - Schema SQL para Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CAPA 3A — IDENTIDAD FAMILIAR ESTABLE
-- ============================================================

CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mama', 'papa')),
  phone TEXT,
  email TEXT,
  avatar_emoji TEXT DEFAULT '👤',
  auth_user_id UUID UNIQUE, -- links to Supabase Auth
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE,
  emoji TEXT DEFAULT '👶',
  school TEXT,
  teacher TEXT,
  grade TEXT,
  allergies TEXT[] DEFAULT '{}',
  medical_notes TEXT,
  personality_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAPA 3B — RUTINAS Y PREFERENCIAS
-- ============================================================

CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'morning', 'afternoon', 'night', 'meal', 'custom'
  name TEXT NOT NULL,
  description TEXT,
  days_of_week INT[] DEFAULT '{1,2,3,4,5}', -- 0=domingo, 1=lunes...
  time_start TIME,
  time_end TIME,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAPA 2 — ESTADO OPERATIVO (semanas/meses)
-- ============================================================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL, -- 'doctor', 'school', 'birthday', 'activity', 'travel', 'other'
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ,
  location TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  source TEXT DEFAULT 'chat', -- 'chat', 'manual', 'email'
  auto_detected BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES parents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES parents(id),
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  source TEXT DEFAULT 'chat',
  auto_detected BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES parents(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAPA 1 — CONTEXTO INMEDIATO (chat)
-- ============================================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES parents(id), -- NULL = Nanny
  sender_type TEXT NOT NULL CHECK (sender_type IN ('parent', 'nanny')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- 'text', 'confirmation', 'summary', 'reminder'
  metadata JSONB DEFAULT '{}', -- intent, entities, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Confirmaciones pendientes de Nanny
CREATE TABLE pending_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id),
  confirmation_type TEXT NOT NULL, -- 'event', 'task', 'update'
  data JSONB NOT NULL, -- the proposed event/task data
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  responded_by UUID REFERENCES parents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- Feedback de intervenciones (👍👎)
CREATE TABLE intervention_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id),
  useful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDICES
-- ============================================================

CREATE INDEX idx_parents_family ON parents(family_id);
CREATE INDEX idx_parents_auth ON parents(auth_user_id);
CREATE INDEX idx_children_family ON children(family_id);
CREATE INDEX idx_events_family ON events(family_id);
CREATE INDEX idx_events_date ON events(date_start);
CREATE INDEX idx_events_child ON events(child_id);
CREATE INDEX idx_tasks_family ON tasks(family_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_messages_family ON messages(family_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_pending_confirmations_family ON pending_confirmations(family_id);
CREATE INDEX idx_pending_confirmations_status ON pending_confirmations(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: parents can only see their family's data
CREATE POLICY "Parents see own family" ON families
  FOR ALL USING (
    id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family parents" ON parents
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family children" ON children
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family events" ON events
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family tasks" ON tasks
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family messages" ON messages
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family confirmations" ON pending_confirmations
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Parents see own family routines" ON routines
  FOR ALL USING (
    child_id IN (
      SELECT id FROM children WHERE family_id IN (
        SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Parents manage own feedback" ON intervention_feedback
  FOR ALL USING (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = auth.uid())
  );

-- ============================================================
-- SEED DATA (familia demo para testing)
-- ============================================================

INSERT INTO families (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Familia Demo');

INSERT INTO parents (id, family_id, name, role, avatar_emoji) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Mamá', 'mama', '👩'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Papá', 'papa', '👨');

INSERT INTO children (id, family_id, name, birth_date, emoji, school, teacher, grade) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Pau', '2021-03-15', '🧒', 'Colegio San José', 'Miss Ana', '1° Preescolar'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Mía', '2023-08-20', '👧', NULL, NULL, NULL);

INSERT INTO routines (child_id, type, name, time_start, time_end) VALUES
  ('00000000-0000-0000-0000-000000000020', 'morning', 'Despertar y desayuno', '07:00', '08:00'),
  ('00000000-0000-0000-0000-000000000020', 'morning', 'Ir al colegio', '08:00', '08:30'),
  ('00000000-0000-0000-0000-000000000020', 'afternoon', 'Recoger del colegio', '14:00', '14:30'),
  ('00000000-0000-0000-0000-000000000020', 'night', 'Baño y cena', '19:00', '20:00'),
  ('00000000-0000-0000-0000-000000000020', 'night', 'Cuento y dormir', '20:00', '20:30');

-- Eventos de ejemplo
INSERT INTO events (family_id, child_id, title, event_type, date_start, status, auto_detected) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Cita pediatra - revisión anual', 'doctor', NOW() + INTERVAL '2 days', 'confirmed', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Festival del colegio', 'school', NOW() + INTERVAL '5 days', 'confirmed', true),
  ('00000000-0000-0000-0000-000000000001', NULL, 'Cumpleaños abuela', 'birthday', NOW() + INTERVAL '8 days', 'confirmed', false);

-- Tareas de ejemplo
INSERT INTO tasks (family_id, child_id, title, assigned_to, due_date, status, priority, auto_detected) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Comprar uniforme nuevo', '00000000-0000-0000-0000-000000000010', NOW() + INTERVAL '3 days', 'pending', 'normal', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Llevar documentos al colegio', '00000000-0000-0000-0000-000000000011', NOW() + INTERVAL '1 day', 'pending', 'high', true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'Agendar vacunas Mía', '00000000-0000-0000-0000-000000000010', NOW() + INTERVAL '7 days', 'pending', 'high', true);
