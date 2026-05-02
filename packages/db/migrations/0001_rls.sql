-- Row-Level Security: tenant isolation via app.business_id session var.
-- Every tenant-owned table FORCEs RLS so even the table owner is filtered.
-- Auth tables (user/session/account/verification) deliberately have NO RLS:
-- Better Auth needs unrestricted access to validate sessions before app.business_id is set.
-- Tenancy on user is enforced at the application layer via session.user.businessId.

-- businesses: row visible only when its id matches app.business_id.
-- INSERT is permissive — signup flow inserts a fresh business before app.business_id is set.
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;

CREATE POLICY businesses_tenant_select ON businesses FOR SELECT
  USING (id = current_setting('app.business_id', true)::uuid);

CREATE POLICY businesses_tenant_update ON businesses FOR UPDATE
  USING (id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (id = current_setting('app.business_id', true)::uuid);

CREATE POLICY businesses_tenant_delete ON businesses FOR DELETE
  USING (id = current_setting('app.business_id', true)::uuid);

CREATE POLICY businesses_signup_insert ON businesses FOR INSERT
  WITH CHECK (true);

-- stores: standard tenant policy on all ops.
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores FORCE ROW LEVEL SECURITY;

CREATE POLICY stores_tenant_all ON stores FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- audit_logs: standard tenant policy on all ops.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_all ON audit_logs FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);
