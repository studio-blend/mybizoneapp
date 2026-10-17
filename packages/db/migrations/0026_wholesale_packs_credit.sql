-- Pack conversion never changes existing quantities, prices or balances.
ALTER TABLE customers ADD COLUMN credit_days integer NOT NULL DEFAULT 0 CHECK(credit_days BETWEEN 0 AND 365);
ALTER TABLE customer_orders ADD COLUMN credit_days integer NOT NULL DEFAULT 0 CHECK(credit_days BETWEEN 0 AND 365);
ALTER TABLE customer_orders ADD COLUMN trade_type text NOT NULL DEFAULT 'standard' CHECK(trade_type IN ('standard','wholesale'));
ALTER TABLE customer_order_items ADD COLUMN pack_snapshot jsonb;
ALTER TABLE sale_items ADD COLUMN pack_snapshot jsonb;
ALTER TABLE purchase_items ADD COLUMN pack_snapshot jsonb;
CREATE TABLE product_packs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 product_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
 unit_type text NOT NULL,
 unit_symbol text NOT NULL,
 qty_per_pack numeric(12,3) NOT NULL CONSTRAINT product_packs_quantity_check CHECK(qty_per_pack>0 AND (unit_type<>'piece' OR mod(qty_per_pack,1)=0)),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT product_packs_product_fk FOREIGN KEY(product_id,business_id) REFERENCES products(id,business_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_packs_active_name_unique ON product_packs(business_id,product_id,lower(name)) WHERE active;
CREATE INDEX product_packs_product_idx ON product_packs(business_id,product_id);
CREATE INDEX customer_orders_trade_idx ON customer_orders(business_id,trade_type,status,promised_on);
ALTER TABLE product_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_packs FORCE ROW LEVEL SECURITY;
CREATE POLICY product_packs_tenant ON product_packs USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON product_packs FROM app_user;
GRANT SELECT,INSERT ON product_packs TO app_user;
GRANT UPDATE(active) ON product_packs TO app_user;

ALTER TABLE customer_order_items ADD CONSTRAINT customer_order_items_pack_check CHECK (pack_snapshot IS NULL OR COALESCE(CASE WHEN jsonb_typeof(pack_snapshot)='object' AND (pack_snapshot->>'factor') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' AND (pack_snapshot->>'packs') ~ '^[0-9]{1,9}$' AND (pack_snapshot->>'loose') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' THEN length(trim(pack_snapshot->>'name')) BETWEEN 1 AND 60 AND (pack_snapshot->>'factor')::numeric>0 AND (pack_snapshot->>'unit')=unit_symbol AND (pack_snapshot->>'factor')::numeric*(pack_snapshot->>'packs')::numeric+(pack_snapshot->>'loose')::numeric=qty AND (pack_snapshot->>'unitType'<>'piece' OR (mod((pack_snapshot->>'factor')::numeric,1)=0 AND mod((pack_snapshot->>'loose')::numeric,1)=0)) ELSE FALSE END,FALSE));

ALTER TABLE sale_items ADD CONSTRAINT sale_items_pack_check CHECK (pack_snapshot IS NULL OR COALESCE(CASE WHEN jsonb_typeof(pack_snapshot)='object' AND (pack_snapshot->>'factor') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' AND (pack_snapshot->>'packs') ~ '^[0-9]{1,9}$' AND (pack_snapshot->>'loose') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' THEN length(trim(pack_snapshot->>'name')) BETWEEN 1 AND 60 AND (pack_snapshot->>'factor')::numeric>0 AND (pack_snapshot->>'unit')=unit_symbol AND (pack_snapshot->>'factor')::numeric*(pack_snapshot->>'packs')::numeric+(pack_snapshot->>'loose')::numeric=qty AND (pack_snapshot->>'unitType'<>'piece' OR (mod((pack_snapshot->>'factor')::numeric,1)=0 AND mod((pack_snapshot->>'loose')::numeric,1)=0)) ELSE FALSE END,FALSE));

ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_pack_check CHECK (pack_snapshot IS NULL OR COALESCE(CASE WHEN jsonb_typeof(pack_snapshot)='object' AND (pack_snapshot->>'factor') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' AND (pack_snapshot->>'packs') ~ '^[0-9]{1,9}$' AND (pack_snapshot->>'loose') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' THEN length(trim(pack_snapshot->>'name')) BETWEEN 1 AND 60 AND (pack_snapshot->>'factor')::numeric>0 AND (pack_snapshot->>'unit')=unit_symbol AND (pack_snapshot->>'factor')::numeric*(pack_snapshot->>'packs')::numeric+(pack_snapshot->>'loose')::numeric=qty AND (pack_snapshot->>'unitType'<>'piece' OR (mod((pack_snapshot->>'factor')::numeric,1)=0 AND mod((pack_snapshot->>'loose')::numeric,1)=0)) ELSE FALSE END,FALSE));
