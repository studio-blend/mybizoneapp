-- M2 Chunk 1: RLS for the new catalog + sales + invoices + invitations tables.
-- Pattern matches 0001/0003: NULLIF guards the empty-string fallback from current_setting.
-- Auth tables (user/session/account/verification) deliberately stay outside RLS — Better Auth
-- needs unrestricted access to validate sessions before app.business_id is known.

-- ── Categories ────────────────────────────────────────────────────────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
CREATE POLICY categories_tenant_all ON categories FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Brands ────────────────────────────────────────────────────────────────
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;
CREATE POLICY brands_tenant_all ON brands FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Products ──────────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_all ON products FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Sales ─────────────────────────────────────────────────────────────────
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_tenant_all ON sales FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Sale items ────────────────────────────────────────────────────────────
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;
CREATE POLICY sale_items_tenant_all ON sale_items FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Invoices ──────────────────────────────────────────────────────────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant_all ON invoices FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── Invitations ───────────────────────────────────────────────────────────
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_all ON invitations FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

-- ── DML grants for app_user ───────────────────────────────────────────────
-- 0002 set ALTER DEFAULT PRIVILEGES, but only for tables created by the same role
-- that ran that ALTER. Re-grant explicitly to be safe across migrations + future
-- container rebuilds.
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON brands TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON sale_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO app_user;
