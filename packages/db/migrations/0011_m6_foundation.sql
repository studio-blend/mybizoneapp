-- M6: Indian SMB Billing Parity — foundation tables + columns
-- RLS pattern matches 0001_rls.sql: ENABLE + FORCE + FOR ALL USING + WITH CHECK using app.business_id.

-- ────────────────────────────────────────────────────────────
-- customers
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  rate_category TEXT NOT NULL DEFAULT 'retail',
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_business_id_idx ON customers(business_id);
CREATE INDEX IF NOT EXISTS customers_business_name_idx ON customers(business_id, name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(business_id, phone);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant ON customers FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- suppliers
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS suppliers_business_id_idx ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS suppliers_business_name_idx ON suppliers(business_id, name);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
CREATE POLICY suppliers_tenant ON suppliers FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- bill_series (FY-aware atomic bill number counters)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'GST',
  last_seq INTEGER NOT NULL DEFAULT 0,
  UNIQUE (business_id, doc_type, financial_year)
);

ALTER TABLE bill_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_series FORCE ROW LEVEL SECURITY;
CREATE POLICY bill_series_tenant ON bill_series FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- sales_settlements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference_no TEXT,
  notes TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_settlements_business_id_idx ON sales_settlements(business_id);
CREATE INDEX IF NOT EXISTS sales_settlements_customer_id_idx ON sales_settlements(customer_id);
CREATE INDEX IF NOT EXISTS sales_settlements_settled_at_idx ON sales_settlements(business_id, settled_at);

ALTER TABLE sales_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_settlements_tenant ON sales_settlements FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- purchase_settlements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference_no TEXT,
  notes TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS purchase_settlements_business_id_idx ON purchase_settlements(business_id);
CREATE INDEX IF NOT EXISTS purchase_settlements_supplier_id_idx ON purchase_settlements(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_settlements_settled_at_idx ON purchase_settlements(business_id, settled_at);

ALTER TABLE purchase_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_settlements_tenant ON purchase_settlements FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- damage_logs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_symbol TEXT NOT NULL,
  cost_per_unit NUMERIC(10,2),
  total_value NUMERIC(12,2),
  reason TEXT NOT NULL,
  notes TEXT,
  logged_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS damage_logs_business_id_idx ON damage_logs(business_id);
CREATE INDEX IF NOT EXISTS damage_logs_product_id_idx ON damage_logs(product_id);
CREATE INDEX IF NOT EXISTS damage_logs_logged_at_idx ON damage_logs(business_id, logged_at);

ALTER TABLE damage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY damage_logs_tenant ON damage_logs FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

-- ────────────────────────────────────────────────────────────
-- quotations + quotation_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  quote_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  valid_until TIMESTAMPTZ,
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  notes TEXT,
  converted_to_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quotations_business_id_idx ON quotations(business_id);
CREATE INDEX IF NOT EXISTS quotations_customer_id_idx ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS quotations_business_created_at_idx ON quotations(business_id, created_at);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations FORCE ROW LEVEL SECURITY;
CREATE POLICY quotations_tenant ON quotations FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS quotation_items_quotation_id_idx ON quotation_items(quotation_id);

-- ────────────────────────────────────────────────────────────
-- delivery_challans + dc_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  dc_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  subtotal NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  notes TEXT,
  converted_to_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS delivery_challans_business_id_idx ON delivery_challans(business_id);
CREATE INDEX IF NOT EXISTS delivery_challans_customer_id_idx ON delivery_challans(customer_id);
CREATE INDEX IF NOT EXISTS delivery_challans_business_created_at_idx ON delivery_challans(business_id, created_at);

ALTER TABLE delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_challans FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_challans_tenant ON delivery_challans FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE TABLE IF NOT EXISTS dc_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_symbol TEXT NOT NULL,
  unit_price NUMERIC(10,2),
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dc_items_dc_id_idx ON dc_items(dc_id);

-- ────────────────────────────────────────────────────────────
-- sales_returns + return_items
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  original_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  return_no TEXT NOT NULL,
  reason TEXT,
  subtotal NUMERIC(12,2) NOT NULL,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_returns_business_id_idx ON sales_returns(business_id);
CREATE INDEX IF NOT EXISTS sales_returns_original_sale_id_idx ON sales_returns(original_sale_id);
CREATE INDEX IF NOT EXISTS sales_returns_business_created_at_idx ON sales_returns(business_id, created_at);

ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_returns_tenant ON sales_returns FOR ALL
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_symbol TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2),
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  cost_price_at_sale NUMERIC(10,2)
);
CREATE INDEX IF NOT EXISTS return_items_return_id_idx ON return_items(return_id);
CREATE INDEX IF NOT EXISTS return_items_product_id_idx ON return_items(product_id);

-- ────────────────────────────────────────────────────────────
-- Extend existing products table
-- ────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rate_1 NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rate_2 NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rate_3 NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rate_4 NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3);

-- ────────────────────────────────────────────────────────────
-- Extend existing sales table
-- ────────────────────────────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS financial_year TEXT;
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON sales(customer_id);
CREATE INDEX IF NOT EXISTS sales_financial_year_idx ON sales(business_id, financial_year);
