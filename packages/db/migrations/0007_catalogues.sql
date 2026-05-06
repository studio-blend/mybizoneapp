-- M3: Catalogue PDFs — tenant-scoped, RLS enforced.

CREATE TABLE IF NOT EXISTS catalogues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES stores(id) ON DELETE SET NULL,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  file_key        TEXT NOT NULL,
  uploaded_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX catalogues_business_id_idx ON catalogues (business_id);
CREATE INDEX catalogues_brand_id_idx ON catalogues (brand_id);

ALTER TABLE catalogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogues FORCE ROW LEVEL SECURITY;

CREATE POLICY catalogues_tenant_all ON catalogues FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON catalogues TO app_user;
