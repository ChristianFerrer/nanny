-- ============================================================
-- MIGRATION: Add medications table for treatment tracking
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  child_name TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  duration_days INT,
  start_date DATE NOT NULL,
  end_date DATE,
  frequency TEXT,
  schedule_times TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  source TEXT DEFAULT 'chat',
  auto_detected BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES parents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medications_family ON medications(family_id);
CREATE INDEX IF NOT EXISTS idx_medications_status ON medications(status);
CREATE INDEX IF NOT EXISTS idx_medications_child ON medications(child_id);

ALTER TABLE medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family medications" ON medications
  FOR ALL USING (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    family_id IN (SELECT family_id FROM parents WHERE auth_user_id = auth.uid())
  );
