-- M7: Purchase bills + purchase returns + income/expense ledger
-- RLS pattern matches 0001_rls.sql / 0011_m6_foundation.sql:
-- ENABLE + FORCE + FOR ALL USING + WITH CHECK using app.business_id.
-- Child line-item tables (purchase_items, purchase_return_items) intentionally
-- have NO RLS — they are accessed only via their parent's id which is already
-- tenant-scoped, and adding RLS would require a denormalized business_id column.

-- ────────────────────────────────────────────────────────────
-- purchases + purchase_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  bill_no TEXT NOT NULL,
  financial_year TEXT,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal NUMERIC(12,2) NOT NULL,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  -- payment_method: 'cash' | 'upi' | 'card' | 'credit' | 'other'
  payment_method TEXT NOT NULL,
  notes TEXT,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchases_business_id_idx ON purchases(business_id);
CREATE INDEX IF NOT EXISTS purchases_supplier_id_idx ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS purchases_business_purchase_date_idx ON purchases(business_id, purchase_date);
CREATE INDEX IF NOT EXISTS purchases_business_financial_year_idx ON purchases(business_id, financial_year);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
CREATE POLICY purchases_tenant ON purchases FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_symbol TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2),
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS purchase_items_product_id_idx ON purchase_items(product_id);

-- ────────────────────────────────────────────────────────────
-- purchase_returns + purchase_return_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  original_purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  return_no TEXT NOT NULL,
  reason TEXT,
  subtotal NUMERIC(12,2) NOT NULL,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  -- status: 'completed' | 'voided'
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchase_returns_business_id_idx ON purchase_returns(business_id);
CREATE INDEX IF NOT EXISTS purchase_returns_original_purchase_id_idx ON purchase_returns(original_purchase_id);
CREATE INDEX IF NOT EXISTS purchase_returns_business_created_at_idx ON purchase_returns(business_id, created_at);

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_returns_tenant ON purchase_returns FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_symbol TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2),
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS purchase_return_items_return_id_idx ON purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS purchase_return_items_product_id_idx ON purchase_return_items(product_id);

-- ────────────────────────────────────────────────────────────
-- expense_entries (income/expense ledger)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- type: 'income' | 'expense'
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL,
  -- payment_method: 'cash' | 'upi' | 'card' | 'cheque' | 'bank' | 'other'
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_no TEXT,
  notes TEXT,
  entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expense_entries_business_id_idx ON expense_entries(business_id);
CREATE INDEX IF NOT EXISTS expense_entries_business_entry_date_idx ON expense_entries(business_id, entry_date);
CREATE INDEX IF NOT EXISTS expense_entries_business_type_idx ON expense_entries(business_id, type);

ALTER TABLE expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_entries_tenant ON expense_entries FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);
