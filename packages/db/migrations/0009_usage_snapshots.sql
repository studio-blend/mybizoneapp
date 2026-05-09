-- One row per business, updated on every create/delete of stores/products/users.
-- Cheaper than COUNT(*) on every request; avoids stale data from cron batches.

CREATE TABLE usage_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  store_count   INTEGER NOT NULL DEFAULT 0,
  product_count INTEGER NOT NULL DEFAULT 0,
  user_count    INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY usage_snapshots_tenant ON usage_snapshots FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);
