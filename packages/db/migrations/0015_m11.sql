-- M11: Customer Tags, Notes, Marketing Campaigns

-- Customer tags
CREATE TABLE IF NOT EXISTS customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamp DEFAULT now()
);
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_tags_tenant ON customer_tags USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON customer_tags TO app_user;
CREATE UNIQUE INDEX IF NOT EXISTS customer_tags_uniq ON customer_tags(business_id, customer_id, tag);

-- Customer notes / timeline
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid,
  created_at timestamp DEFAULT now()
);
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_notes_tenant ON customer_notes USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON customer_notes TO app_user;

-- Marketing campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  message_template text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  recipient_count int DEFAULT 0,
  sent_at timestamp,
  created_at timestamp DEFAULT now()
);
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_tenant ON marketing_campaigns USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON marketing_campaigns TO app_user;

-- Campaign recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  phone text,
  personalized_message text,
  opened_whatsapp_at timestamp
);
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_recipients_tenant ON campaign_recipients USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON campaign_recipients TO app_user;
