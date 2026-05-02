-- M2 Chunk 1: catalog (categories, brands, products) + sales + invoices + invitations.
-- Extends "user" with store scoping + active flag for employees.

-- ── Auth user: add store scoping + active flag ────────────────────────────
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- ── Categories (self-ref for sub-cats) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_business_parent_name_unique UNIQUE (business_id, parent_id, name)
);
CREATE INDEX IF NOT EXISTS categories_business_id_idx ON categories(business_id);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories(parent_id);

-- ── Brands ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brands_business_name_unique UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS brands_business_id_idx ON brands(business_id);

-- ── Products (NUMERIC for fractional units; CHECK enforces non-negative inv) ───
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  description TEXT,
  unit_type TEXT NOT NULL,
  unit_symbol TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  inventory NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (inventory >= 0),
  hsn_code TEXT,
  gst_rate NUMERIC(5,2),
  image_key TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_business_store_idx ON products(business_id, store_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS products_brand_id_idx ON products(brand_id);
CREATE INDEX IF NOT EXISTS products_business_name_idx ON products(business_id, name);

-- ── Sales ─────────────────────────────────────────────────────────────────
-- store_id ON DELETE RESTRICT: deleting a store with sales must fail (audit trail).
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  employee_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  bill_no TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_gstin TEXT,
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  payment_method TEXT NOT NULL,
  bill_image_key TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_business_bill_no_unique UNIQUE (business_id, bill_no)
);
CREATE INDEX IF NOT EXISTS sales_business_created_at_idx ON sales(business_id, created_at);
CREATE INDEX IF NOT EXISTS sales_store_created_at_idx ON sales(store_id, created_at);
CREATE INDEX IF NOT EXISTS sales_employee_id_idx ON sales(employee_id);

-- ── Sale items (snapshot pricing/tax for audit immutability) ──────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit_symbol TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  hsn_code TEXT,
  gst_rate NUMERIC(5,2),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  gst_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS sale_items_business_id_idx ON sale_items(business_id);

-- ── Invoices (1:1 with sales when GST applies) ────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  business_gstin TEXT,
  customer_gstin TEXT,
  customer_name TEXT,
  customer_address TEXT,
  is_interstate BOOLEAN NOT NULL DEFAULT false,
  subtotal NUMERIC(12,2) NOT NULL,
  cgst NUMERIC(10,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(10,2) NOT NULL DEFAULT 0,
  igst NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  pdf_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_business_invoice_no_unique UNIQUE (business_id, invoice_no)
);
CREATE INDEX IF NOT EXISTS invoices_business_id_idx ON invoices(business_id);

-- ── Invitations (employee + admin invites) ────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invitations_business_id_idx ON invitations(business_id);
CREATE INDEX IF NOT EXISTS invitations_business_email_idx ON invitations(business_id, email);

-- ── User: store_id FK now that stores exists (table did before this migration) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_store_id_fkey'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT user_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
  END IF;
END
$$;
