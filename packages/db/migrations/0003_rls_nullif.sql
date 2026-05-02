-- RLS policies originally cast `current_setting('app.business_id', true)::uuid`.
-- When the setting has never been set, current_setting returns the empty string
-- (NOT NULL), and `''::uuid` raises `invalid input syntax for type uuid: ""`.
-- Wrap with NULLIF so unset → NULL → comparison evaluates to NULL → row hidden.
DROP POLICY IF EXISTS businesses_tenant_select ON businesses;
DROP POLICY IF EXISTS businesses_tenant_update ON businesses;
DROP POLICY IF EXISTS businesses_tenant_delete ON businesses;
DROP POLICY IF EXISTS stores_tenant_all ON stores;
DROP POLICY IF EXISTS audit_logs_tenant_all ON audit_logs;

CREATE POLICY businesses_tenant_select ON businesses FOR SELECT
  USING (id = NULLIF(current_setting('app.business_id', true), '')::uuid);

CREATE POLICY businesses_tenant_update ON businesses FOR UPDATE
  USING (id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.business_id', true), '')::uuid);

CREATE POLICY businesses_tenant_delete ON businesses FOR DELETE
  USING (id = NULLIF(current_setting('app.business_id', true), '')::uuid);

CREATE POLICY stores_tenant_all ON stores FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);

CREATE POLICY audit_logs_tenant_all ON audit_logs FOR ALL
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
