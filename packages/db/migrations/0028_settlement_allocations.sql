-- Preserve existing receipts and payments. No historical allocation is inferred.
ALTER TABLE sales_settlements ADD COLUMN request_hash text;
ALTER TABLE purchase_settlements ADD COLUMN request_hash text;
ALTER TABLE sales_settlements ADD CONSTRAINT sales_settlements_party_unique UNIQUE(id,business_id,customer_id);
ALTER TABLE purchase_settlements ADD CONSTRAINT purchase_settlements_party_unique UNIQUE(id,business_id,supplier_id);
ALTER TABLE sales ADD CONSTRAINT sales_party_unique UNIQUE(id,business_id,customer_id);
ALTER TABLE purchases ADD CONSTRAINT purchases_party_unique UNIQUE(id,business_id,supplier_id);
CREATE TABLE sales_settlement_allocations (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL,settlement_id uuid NOT NULL,sale_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
 request_hash text NOT NULL,created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(settlement_id,business_id,customer_id) REFERENCES sales_settlements(id,business_id,customer_id),
 FOREIGN KEY(sale_id,business_id,customer_id) REFERENCES sales(id,business_id,customer_id)
);
CREATE TABLE purchase_settlement_allocations (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 supplier_id uuid NOT NULL,settlement_id uuid NOT NULL,purchase_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount>0),note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),
 request_hash text NOT NULL,created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(settlement_id,business_id,supplier_id) REFERENCES purchase_settlements(id,business_id,supplier_id),
 FOREIGN KEY(purchase_id,business_id,supplier_id) REFERENCES purchases(id,business_id,supplier_id)
);
CREATE INDEX sales_settlement_allocations_bill_idx ON sales_settlement_allocations(business_id,sale_id);
CREATE INDEX sales_settlement_allocations_receipt_idx ON sales_settlement_allocations(business_id,settlement_id);
CREATE INDEX purchase_settlement_allocations_bill_idx ON purchase_settlement_allocations(business_id,purchase_id);
CREATE INDEX purchase_settlement_allocations_payment_idx ON purchase_settlement_allocations(business_id,settlement_id);
ALTER TABLE sales_settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_settlement_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_settlement_allocations_tenant ON sales_settlement_allocations USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
ALTER TABLE purchase_settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_settlement_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY purchase_settlement_allocations_tenant ON purchase_settlement_allocations USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON sales_settlement_allocations,purchase_settlement_allocations FROM app_user;
GRANT SELECT,INSERT ON sales_settlement_allocations,purchase_settlement_allocations TO app_user;
-- Money documents and their new allocation evidence cannot be edited through the application role.
REVOKE UPDATE,DELETE ON sales_settlements,purchase_settlements FROM app_user;
