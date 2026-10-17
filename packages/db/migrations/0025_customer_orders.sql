-- Optional order workflow. No existing transaction, stock or balance is backfilled.
ALTER TABLE customers ADD CONSTRAINT customers_id_business_unique UNIQUE (id,business_id);
ALTER TABLE stores ADD CONSTRAINT stores_id_business_unique UNIQUE (id,business_id);
ALTER TABLE sales ADD CONSTRAINT sales_id_business_unique UNIQUE (id,business_id);

CREATE TABLE customer_orders (
 id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 store_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 order_no text NOT NULL,
 customer_name text NOT NULL,
 customer_phone text,
 customer_gstin text,
 delivery_address text NOT NULL CHECK(length(trim(delivery_address)) BETWEEN 1 AND 1000),
 promised_on date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')),
 bill_type text NOT NULL CHECK(bill_type IN ('gst_bill','non_gst_bill')),
 gst_enabled boolean NOT NULL,
 business_gstin text,
 is_interstate boolean NOT NULL,
 total numeric(12,2) NOT NULL CHECK(total>=0),
 notes text,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_orders_store_fk FOREIGN KEY(store_id,business_id) REFERENCES stores(id,business_id),
 CONSTRAINT customer_orders_customer_fk FOREIGN KEY(customer_id,business_id) REFERENCES customers(id,business_id),
 CONSTRAINT customer_orders_id_tenant UNIQUE(id,business_id),
 CONSTRAINT customer_orders_no_unique UNIQUE(business_id,order_no)
);
CREATE INDEX customer_orders_store_due_idx ON customer_orders(business_id,store_id,status,promised_on);
CREATE INDEX customer_orders_customer_idx ON customer_orders(business_id,customer_id);

CREATE TABLE customer_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 order_id uuid NOT NULL,
 product_id uuid NOT NULL,
 department_id uuid,
 product_name text NOT NULL,
 unit_type text NOT NULL,
 unit_symbol text NOT NULL,
 qty numeric(12,3) NOT NULL CHECK(qty>0),
 delivered_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK(delivered_qty>=0 AND delivered_qty<=qty),
 unit_price numeric(10,2) NOT NULL CHECK(unit_price>=0),
 hsn_code text,
 gst_rate numeric(5,2),
 subtotal numeric(12,2) NOT NULL CHECK(subtotal>=0),
 tax_total numeric(12,2) NOT NULL CHECK(tax_total>=0),
 line_total numeric(12,2) NOT NULL CHECK(line_total=subtotal+tax_total),
 CONSTRAINT customer_order_items_order_fk FOREIGN KEY(order_id,business_id) REFERENCES customer_orders(id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_items_product_fk FOREIGN KEY(product_id,business_id) REFERENCES products(id,business_id),
 CONSTRAINT customer_order_items_id_tenant UNIQUE(id,business_id),
 CONSTRAINT customer_order_items_id_order_tenant UNIQUE(id,order_id,business_id),
 CONSTRAINT customer_order_items_order_product UNIQUE(order_id,product_id)
);
CREATE INDEX customer_order_items_order_idx ON customer_order_items(order_id);

CREATE TABLE customer_order_payments (
 id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 order_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('receipt','refund')),
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 method text NOT NULL CHECK(method IN ('cash','upi','card','bank_transfer','other')),
 reference text,
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_order_payments_order_fk FOREIGN KEY(order_id,business_id) REFERENCES customer_orders(id,business_id) ON DELETE CASCADE
);
CREATE INDEX customer_order_payments_order_idx ON customer_order_payments(business_id,order_id);

CREATE TABLE customer_order_deliveries (
 id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 order_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_order_deliveries_order_fk FOREIGN KEY(order_id,business_id) REFERENCES customer_orders(id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_deliveries_sale_fk FOREIGN KEY(sale_id,business_id) REFERENCES sales(id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_deliveries_id_tenant UNIQUE(id,business_id),
 CONSTRAINT customer_order_deliveries_id_order_tenant UNIQUE(id,order_id,business_id),
 CONSTRAINT customer_order_deliveries_sale_unique UNIQUE(sale_id)
);
CREATE INDEX customer_order_deliveries_order_idx ON customer_order_deliveries(order_id);

CREATE TABLE customer_order_delivery_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 delivery_id uuid NOT NULL,
 order_id uuid NOT NULL,
 order_item_id uuid NOT NULL,
 qty numeric(12,3) NOT NULL CHECK(qty>0),
 CONSTRAINT customer_order_delivery_items_delivery_fk FOREIGN KEY(delivery_id,order_id,business_id) REFERENCES customer_order_deliveries(id,order_id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_delivery_items_item_fk FOREIGN KEY(order_item_id,order_id,business_id) REFERENCES customer_order_items(id,order_id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_delivery_items_unique UNIQUE(delivery_id,order_item_id)
);

CREATE TABLE customer_order_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 order_id uuid NOT NULL,
 delivery_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount<>0),
 origin_kind text NOT NULL CHECK(origin_kind IN ('receipt','delivery','return','return_apply')),
 origin_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_order_allocations_order_fk FOREIGN KEY(order_id,business_id) REFERENCES customer_orders(id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_allocations_delivery_fk FOREIGN KEY(delivery_id,order_id,business_id) REFERENCES customer_order_deliveries(id,order_id,business_id) ON DELETE CASCADE,
 CONSTRAINT customer_order_allocations_sign CHECK((origin_kind='return' AND amount<0) OR (origin_kind IN ('receipt','delivery','return_apply') AND amount>0)),
 CONSTRAINT customer_order_allocations_once UNIQUE(delivery_id,origin_kind,origin_id)
);
CREATE INDEX customer_order_allocations_order_idx ON customer_order_allocations(business_id,order_id);

ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_orders_tenant ON customer_orders USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_orders FROM app_user;
GRANT SELECT,INSERT ON customer_orders TO app_user;
GRANT UPDATE(status,promised_on,delivery_address,notes,updated_at) ON customer_orders TO app_user;
ALTER TABLE customer_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_order_items_tenant ON customer_order_items USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_order_items FROM app_user;
GRANT SELECT,INSERT ON customer_order_items TO app_user;
GRANT UPDATE(delivered_qty) ON customer_order_items TO app_user;
ALTER TABLE customer_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_order_payments_tenant ON customer_order_payments USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_order_payments FROM app_user;
GRANT SELECT,INSERT ON customer_order_payments TO app_user;
ALTER TABLE customer_order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_order_deliveries_tenant ON customer_order_deliveries USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_order_deliveries FROM app_user;
GRANT SELECT,INSERT ON customer_order_deliveries TO app_user;
ALTER TABLE customer_order_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_delivery_items FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_order_delivery_items_tenant ON customer_order_delivery_items USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_order_delivery_items FROM app_user;
GRANT SELECT,INSERT ON customer_order_delivery_items TO app_user;
ALTER TABLE customer_order_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_order_allocations_tenant ON customer_order_allocations USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON customer_order_allocations FROM app_user;
GRANT SELECT,INSERT ON customer_order_allocations TO app_user;
