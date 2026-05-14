-- Tabla `support_contacts`: red de apoyo de la familia — abuela, niñera,
-- tía, pediatra, etc. Nanny puede iniciar conversación con estos contactos
-- vía WhatsApp Business API (con consentimiento explícito).
--
-- Privacidad: Nanny NUNCA comparte info más allá del pedido puntual al
-- contacto. El contacto no ve la agenda familiar.

CREATE TABLE IF NOT EXISTS support_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL, -- 'abuela_materna' | 'abuela_paterna' | 'abuelo_materno' | 'abuelo_paterno' | 'tia' | 'tio' | 'niñera' | 'pediatra' | 'otro'
  phone_whatsapp TEXT NOT NULL, -- formato internacional E.164: +5491112345678
  applies_to_child_ids UUID[] DEFAULT '{}', -- ids de hijos a los que aplica (vacío = todos)
  availability_notes TEXT,    -- ej: "martes y jueves tarde", "trabaja hasta las 17"
  notes TEXT,                 -- libre: "tiene auto", "habla inglés", etc.
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending', 'active', 'rejected', 'paused')),
  consent_message_sent_at TIMESTAMPTZ, -- cuándo Nanny le pidió consentimiento
  consent_response_at TIMESTAMPTZ,     -- cuándo respondió (sí o no)
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_contacts_family
  ON support_contacts(family_id) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_support_contacts_phone
  ON support_contacts(phone_whatsapp);

ALTER TABLE support_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own family support contacts"
  ON support_contacts
  USING (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  );
