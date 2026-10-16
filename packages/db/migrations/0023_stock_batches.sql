-- Optional batch tracking. Existing stock and transaction amounts stay intact.
ALTER TABLE products ADD COLUMN batch_tracking boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD CONSTRAINT products_id_business_unique UNIQUE (id, business_id);

CREATE TABLE stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 80),
  expires_on date,
  state text NOT NULL DEFAULT 'available' CHECK (state IN ('available', 'quarantine')),
  quantity numeric(12,3) NOT NULL CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_batches_product_tenant_fk FOREIGN KEY (product_id, business_id)
    REFERENCES products(id, business_id) ON DELETE CASCADE,
  CONSTRAINT stock_batches_expiry_required CHECK (state = 'quarantine' OR expires_on IS NOT NULL),
  CONSTRAINT stock_batches_product_code_unique UNIQUE (product_id, code),
  CONSTRAINT stock_batches_id_tenant_unique UNIQUE (id, business_id)
);
CREATE INDEX stock_batches_expiry_idx ON stock_batches(business_id, expires_on, product_id);
CREATE INDEX stock_batches_product_idx ON stock_batches(product_id);
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_batches_tenant ON stock_batches
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
REVOKE ALL ON stock_batches FROM app_user;
GRANT SELECT, INSERT, UPDATE ON stock_batches TO app_user;

CREATE TABLE stock_batch_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opening', 'purchase', 'sale', 'sales_return', 'purchase_return', 'damage')),
  document_id uuid NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_batch_movements_batch_tenant_fk FOREIGN KEY (batch_id, business_id)
    REFERENCES stock_batches(id, business_id) ON DELETE CASCADE,
  CONSTRAINT stock_batch_movements_sign CHECK (
    (kind IN ('opening', 'purchase', 'sales_return') AND quantity > 0)
    OR (kind IN ('sale', 'purchase_return', 'damage') AND quantity < 0))
);
CREATE INDEX stock_batch_movements_document_idx ON stock_batch_movements(business_id, kind, document_id);
CREATE INDEX stock_batch_movements_batch_idx ON stock_batch_movements(batch_id);
ALTER TABLE stock_batch_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batch_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_batch_movements_tenant ON stock_batch_movements
  USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid);
REVOKE ALL ON stock_batch_movements FROM app_user;
GRANT SELECT, INSERT ON stock_batch_movements TO app_user;
