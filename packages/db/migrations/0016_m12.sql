-- M12: RBAC + Departments

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  store_id uuid REFERENCES stores(id),
  name text NOT NULL,
  description text,
  created_at timestamp DEFAULT now()
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_tenant ON departments USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON departments TO app_user;

-- User roles (many-to-many: user <-> role, scoped to store/dept)
-- ADDITIVE -- do NOT remove users.role column
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin','admin','shop_manager','branch_manager','floor_manager','sales','marketing','inventory','billing','accounts')),
  store_id uuid REFERENCES stores(id),
  department_id uuid REFERENCES departments(id),
  granted_by text,
  created_at timestamp DEFAULT now()
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_tenant ON user_roles USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON user_roles TO app_user;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_uniq ON user_roles(business_id, user_id, role, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'), COALESCE(department_id, '00000000-0000-0000-0000-000000000000'));

-- Ownership transfer (super_admin -> admin)
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  from_user_id text NOT NULL,
  to_user_id text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  accepted_at timestamp,
  created_at timestamp DEFAULT now()
);
ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ownership_transfers_tenant ON ownership_transfers USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON ownership_transfers TO app_user;

-- Add department_id to bill_series and products (optional, for floor-level billing)
ALTER TABLE bill_series ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

-- Backfill existing user roles into user_roles table
-- Using a DO block that runs as superuser (outside RLS context):
DO $$
BEGIN
  INSERT INTO user_roles (id, business_id, user_id, role, created_at)
  SELECT
    gen_random_uuid(),
    u.business_id::uuid,
    u.id,
    CASE
      WHEN u.role IN ('super_admin','admin','shop_manager','branch_manager','floor_manager','sales','marketing','inventory','billing','accounts') THEN u.role
      ELSE 'sales'
    END,
    now()
  FROM "user" u
  WHERE u.business_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END $$;
