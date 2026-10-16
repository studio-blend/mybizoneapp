-- Optional unit tracking. Existing inventory and warranty facts remain unchanged.
ALTER TABLE products ADD COLUMN serial_tracking boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN serial_tracking_since timestamptz;
ALTER TABLE products ADD COLUMN warranty_months integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN warranty_issuer text;
ALTER TABLE products ADD CONSTRAINT products_tracking_exclusive CHECK (NOT (batch_tracking AND serial_tracking));
ALTER TABLE products ADD CONSTRAINT products_serial_piece CHECK (NOT serial_tracking OR (unit_type='piece' AND unit_symbol='pc' AND serial_tracking_since IS NOT NULL));
ALTER TABLE products ADD CONSTRAINT products_warranty_term CHECK (warranty_months BETWEEN 0 AND 120 AND (warranty_months=0 OR (serial_tracking AND warranty_issuer IS NOT NULL AND length(trim(warranty_issuer)) BETWEEN 1 AND 120)));

CREATE TABLE stock_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9./_-]{0,79}$'),
  state text NOT NULL CHECK (state IN ('available','quarantine','sold','damaged','supplier_return')),
  receipt_id uuid,
  last_sale_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_serials_product_tenant_fk FOREIGN KEY (product_id,business_id) REFERENCES products(id,business_id) ON DELETE CASCADE,
  CONSTRAINT stock_serials_business_code_unique UNIQUE (business_id,code),
  CONSTRAINT stock_serials_id_tenant_unique UNIQUE (id,business_id)
);
CREATE INDEX stock_serials_product_state_idx ON stock_serials(business_id,product_id,state);
ALTER TABLE stock_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_serials FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_serials_tenant ON stock_serials
  USING (business_id=NULLIF(current_setting('app.business_id',true),'')::uuid)
  WITH CHECK (business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON stock_serials FROM app_user;
GRANT SELECT,INSERT,UPDATE ON stock_serials TO app_user;

CREATE TABLE stock_serial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  serial_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opening','purchase','sale','sales_return','purchase_return','damage','hold','release')),
  document_id uuid NOT NULL,
  related_sale_id uuid,
  warranty_months integer NOT NULL DEFAULT 0 CHECK (warranty_months BETWEEN 0 AND 120),
  warranty_ends_on date,
  warranty_issuer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_serial_events_tenant_fk FOREIGN KEY (serial_id,business_id) REFERENCES stock_serials(id,business_id) ON DELETE CASCADE,
  CONSTRAINT stock_serial_events_warranty CHECK ((warranty_months=0 AND warranty_ends_on IS NULL AND warranty_issuer IS NULL) OR (kind='sale' AND warranty_months>0 AND warranty_ends_on IS NOT NULL AND warranty_issuer IS NOT NULL AND length(trim(warranty_issuer)) BETWEEN 1 AND 120))
);
CREATE INDEX stock_serial_events_document_idx ON stock_serial_events(business_id,kind,document_id);
CREATE INDEX stock_serial_events_serial_idx ON stock_serial_events(serial_id,created_at);
ALTER TABLE stock_serial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_serial_events FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_serial_events_tenant ON stock_serial_events
  USING (business_id=NULLIF(current_setting('app.business_id',true),'')::uuid)
  WITH CHECK (business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON stock_serial_events FROM app_user;
GRANT SELECT,INSERT ON stock_serial_events TO app_user;
