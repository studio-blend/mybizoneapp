-- M8: Billing Depth + Credit Control
-- Adds: payment_type breakdown, bill_type (gst/non-gst/estimate), item-level discounts/free items,
-- EMI schedules + payments, opening balances per FY.
-- RLS pattern uses NULLIF guard (matches 0001_rls.sql) so an unset session var returns no rows
-- rather than erroring on empty-string cast.

-- ────────────────────────────────────────────────────────────
-- sales: bill_type, payment_details, due_date, payment_status
-- ────────────────────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS bill_type TEXT NOT NULL DEFAULT 'gst_bill';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_details JSONB;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid';

-- ────────────────────────────────────────────────────────────
-- sale_items: free item flag + per-line discount
-- ────────────────────────────────────────────────────────────
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_free_item BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS free_qty NUMERIC(12,3);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS item_discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- emi_schedules
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emi_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  finance_company TEXT NOT NULL,
  principal_amount NUMERIC(12,2) NOT NULL,
  down_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  tenure_months INTEGER NOT NULL,
  emi_amount NUMERIC(12,2) NOT NULL,
  interest_rate NUMERIC(5,2),
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emi_schedules_business_id_idx ON emi_schedules(business_id);
CREATE INDEX IF NOT EXISTS emi_schedules_sale_id_idx ON emi_schedules(sale_id);
CREATE INDEX IF NOT EXISTS emi_schedules_customer_id_idx ON emi_schedules(customer_id);

ALTER TABLE emi_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY emi_schedules_tenant ON emi_schedules
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON emi_schedules TO app_user;

-- ────────────────────────────────────────────────────────────
-- emi_payments
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emi_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  emi_schedule_id UUID NOT NULL REFERENCES emi_schedules(id) ON DELETE CASCADE,
  instalment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  amount_paid NUMERIC(12,2),
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emi_payments_business_id_idx ON emi_payments(business_id);
CREATE INDEX IF NOT EXISTS emi_payments_schedule_id_idx ON emi_payments(emi_schedule_id);
CREATE INDEX IF NOT EXISTS emi_payments_business_due_date_idx ON emi_payments(business_id, due_date);

ALTER TABLE emi_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY emi_payments_tenant ON emi_payments
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON emi_payments TO app_user;

-- ────────────────────────────────────────────────────────────
-- opening_balances (per-entity per-FY snapshot)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- entity_type: 'customer' | 'supplier'
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- financial_year format: '2025-26'
  financial_year TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, entity_type, entity_id, financial_year)
);
CREATE INDEX IF NOT EXISTS opening_balances_business_id_idx ON opening_balances(business_id);
CREATE INDEX IF NOT EXISTS opening_balances_entity_idx ON opening_balances(business_id, entity_type, entity_id);

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY opening_balances_tenant ON opening_balances
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
GRANT ALL ON opening_balances TO app_user;
