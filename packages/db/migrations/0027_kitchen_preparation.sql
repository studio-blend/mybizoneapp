-- Optional prep-to-stock kitchen workflow. Existing products are not activated or converted.
ALTER TABLE damage_logs ADD CONSTRAINT damage_logs_id_business_unique UNIQUE(id,business_id);
CREATE TABLE kitchen_recipes (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 store_id uuid NOT NULL,output_product_id uuid NOT NULL,name text NOT NULL,output_name text NOT NULL,
 unit_type text NOT NULL,unit_symbol text NOT NULL,yield_qty numeric(12,3) NOT NULL,
 active boolean NOT NULL DEFAULT true,request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT kitchen_recipes_id_business_unique UNIQUE(id,business_id),
 FOREIGN KEY(store_id,business_id) REFERENCES stores(id,business_id),
 FOREIGN KEY(output_product_id,business_id) REFERENCES products(id,business_id),
 CONSTRAINT kitchen_recipes_name_check CHECK(length(trim(name)) BETWEEN 1 AND 100),
 CONSTRAINT kitchen_recipes_yield_check CHECK(yield_qty>0 AND (unit_type<>'piece' OR mod(yield_qty,1)=0))
);
CREATE INDEX kitchen_recipes_store_idx ON kitchen_recipes(business_id,store_id,active);
CREATE TABLE kitchen_recipe_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 recipe_id uuid NOT NULL,product_id uuid NOT NULL,product_name text NOT NULL,unit_type text NOT NULL,unit_symbol text NOT NULL,qty numeric(12,3) NOT NULL,
 FOREIGN KEY(recipe_id,business_id) REFERENCES kitchen_recipes(id,business_id) ON DELETE CASCADE,
 FOREIGN KEY(product_id,business_id) REFERENCES products(id,business_id),
 CONSTRAINT kitchen_recipe_items_product_unique UNIQUE(recipe_id,product_id),
 CONSTRAINT kitchen_recipe_items_qty_check CHECK(qty>0 AND (unit_type<>'piece' OR mod(qty,1)=0))
);
CREATE TABLE kitchen_tickets (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 recipe_id uuid NOT NULL,store_id uuid NOT NULL,reference text NOT NULL,runs integer NOT NULL,status text NOT NULL DEFAULT 'queued',
 note text NOT NULL DEFAULT '',request_hash text NOT NULL,completion_hash text,
 actual_output numeric(12,3),ingredient_cost numeric(14,2),unit_cost numeric(10,2),batch_code text,expires_on date,completion_note text,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,completed_by text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 CONSTRAINT kitchen_tickets_id_business_unique UNIQUE(id,business_id),
 FOREIGN KEY(recipe_id,business_id) REFERENCES kitchen_recipes(id,business_id),
 FOREIGN KEY(store_id,business_id) REFERENCES stores(id,business_id),
 CONSTRAINT kitchen_tickets_runs_check CHECK(runs BETWEEN 1 AND 10000),
 CONSTRAINT kitchen_tickets_reference_check CHECK(length(trim(reference)) BETWEEN 1 AND 100),
 CONSTRAINT kitchen_tickets_status_check CHECK(status IN ('queued','preparing','completed','cancelled')),
 CONSTRAINT kitchen_tickets_completion_check CHECK((status='completed' AND actual_output IS NOT NULL AND actual_output>0 AND completed_at IS NOT NULL AND completion_hash IS NOT NULL) OR (status<>'completed' AND actual_output IS NULL AND completed_at IS NULL AND completion_hash IS NULL)),
 CONSTRAINT kitchen_tickets_cost_check CHECK((ingredient_cost IS NULL)=(unit_cost IS NULL) AND (ingredient_cost IS NULL OR ingredient_cost>=0) AND (unit_cost IS NULL OR unit_cost>=0))
);
CREATE INDEX kitchen_tickets_queue_idx ON kitchen_tickets(business_id,store_id,status,created_at);
CREATE TABLE kitchen_consumptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 ticket_id uuid NOT NULL,product_id uuid NOT NULL,product_name text NOT NULL,unit_symbol text NOT NULL,
 qty numeric(12,3) NOT NULL,cost_per_unit numeric(10,2),total_value numeric(12,2),
 FOREIGN KEY(ticket_id,business_id) REFERENCES kitchen_tickets(id,business_id) ON DELETE CASCADE,
 FOREIGN KEY(product_id,business_id) REFERENCES products(id,business_id),
 CONSTRAINT kitchen_consumptions_product_unique UNIQUE(ticket_id,product_id),
 CONSTRAINT kitchen_consumptions_qty_check CHECK(qty>0),
 CONSTRAINT kitchen_consumptions_cost_check CHECK((cost_per_unit IS NULL)=(total_value IS NULL) AND (cost_per_unit IS NULL OR cost_per_unit>=0) AND (total_value IS NULL OR total_value>=0))
);
CREATE TABLE kitchen_waste (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 store_id uuid NOT NULL,damage_id uuid NOT NULL,reason text NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,business_id) REFERENCES stores(id,business_id),
 FOREIGN KEY(damage_id,business_id) REFERENCES damage_logs(id,business_id),
 CONSTRAINT kitchen_waste_damage_unique UNIQUE(damage_id),
 CONSTRAINT kitchen_waste_reason_check CHECK(reason IN ('preparation','unsold','spillage','expired','other'))
);
CREATE INDEX kitchen_waste_store_idx ON kitchen_waste(business_id,store_id,created_at);
ALTER TABLE stock_batch_movements DROP CONSTRAINT stock_batch_movements_kind_check;
ALTER TABLE stock_batch_movements DROP CONSTRAINT stock_batch_movements_sign;
ALTER TABLE stock_batch_movements ADD CONSTRAINT stock_batch_movements_kind_check CHECK(kind IN ('opening','purchase','sale','sales_return','purchase_return','damage','kitchen_use','kitchen_output'));
ALTER TABLE stock_batch_movements ADD CONSTRAINT stock_batch_movements_sign CHECK((kind IN ('opening','purchase','sales_return','kitchen_output') AND quantity>0) OR (kind IN ('sale','purchase_return','damage','kitchen_use') AND quantity<0));
ALTER TABLE kitchen_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_recipes FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_recipes_tenant ON kitchen_recipes USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
ALTER TABLE kitchen_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_recipe_items FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_recipe_items_tenant ON kitchen_recipe_items USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_tickets_tenant ON kitchen_tickets USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
ALTER TABLE kitchen_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_consumptions FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_consumptions_tenant ON kitchen_consumptions USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
ALTER TABLE kitchen_waste ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_waste FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_waste_tenant ON kitchen_waste USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON kitchen_recipes,kitchen_recipe_items,kitchen_tickets,kitchen_consumptions,kitchen_waste FROM app_user;
GRANT SELECT,INSERT ON kitchen_recipes,kitchen_recipe_items,kitchen_tickets,kitchen_consumptions,kitchen_waste TO app_user;
GRANT UPDATE(active) ON kitchen_recipes TO app_user;
GRANT UPDATE(status,completion_hash,actual_output,ingredient_cost,unit_cost,batch_code,expires_on,completion_note,completed_by,completed_at) ON kitchen_tickets TO app_user;
