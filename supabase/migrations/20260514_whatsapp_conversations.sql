-- Tabla `whatsapp_conversations`: log de mensajes entre Nanny y contactos
-- de apoyo vía WhatsApp Business API.
--
-- Permite: rastrear consentimientos, esperar respuestas, traducir
-- intenciones humanas ("dale", "no puedo", "a las 5") a acciones
-- estructuradas que el decision agent procesa.

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES support_contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_text TEXT NOT NULL,
  intent TEXT, -- 'consent_request' | 'consent_accept' | 'consent_reject' | 'logistics_request' | 'logistics_confirm' | 'logistics_decline' | 'clarification' | 'other'
  parsed_response JSONB, -- estructura: { confirmed: bool, alternative: text, wait_until: timestamp, etc. }
  related_event_id UUID REFERENCES events(id) ON DELETE SET NULL, -- evento al que se refiere si aplica
  meta_message_id TEXT,  -- id que devuelve Meta API
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_in_chat BOOLEAN NOT NULL DEFAULT FALSE, -- ¿Nanny ya tradujo esta respuesta al chat familiar?
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_family
  ON whatsapp_conversations(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_contact
  ON whatsapp_conversations(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_pending_reply
  ON whatsapp_conversations(family_id, created_at)
  WHERE direction = 'inbound' AND replied_in_chat = FALSE;

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own family whatsapp conversations"
  ON whatsapp_conversations
  FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM parents WHERE auth_user_id = auth.uid()
    )
  );

-- Solo el servidor escribe (admin client desde el webhook + send endpoint).
-- Los padres no manipulan esta tabla directamente.
