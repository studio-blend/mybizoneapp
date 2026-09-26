-- Bind payment notifications to the subscription created for this business.
ALTER TABLE businesses ADD COLUMN subscription_id TEXT;
ALTER TABLE businesses ADD COLUMN subscription_status TEXT;
ALTER TABLE businesses ADD COLUMN subscription_event_at TIMESTAMPTZ;
CREATE UNIQUE INDEX businesses_subscription_id_unique ON businesses(subscription_id)
  WHERE subscription_id IS NOT NULL;
