-- M2 Chunk 4: per-tenant bill + invoice number counters.
-- UPSERT pattern in the POS action increments atomically without table-level locks.

CREATE TABLE IF NOT EXISTS bill_counters (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_sale_no INTEGER NOT NULL DEFAULT 0,
  last_invoice_no INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE bill_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_counters FORCE ROW LEVEL SECURITY;

CREATE POLICY bill_counters_tenant_all ON bill_counters FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON bill_counters TO app_user;
