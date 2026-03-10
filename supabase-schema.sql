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
-- MVP: acceso abierto con anon key (sin auth por ahora)
-- TODO: agregar auth con OTP y policies por familia
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

-- MVP: permitir acceso con anon key (se restringe cuando se agregue auth)
CREATE POLICY "Allow all for MVP" ON families FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON parents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON children FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON pending_confirmations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON routines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON intervention_feedback FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- NOTA: No hay seed data. El onboarding de la app crea la familia.
-- ============================================================

-- Para insertar datos de prueba, usa el onboarding de la app en /onboarding
