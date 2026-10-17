-- New snapshots describe only returns created after this migration.
ALTER TABLE sales_returns ADD COLUMN debt_reduction_amount numeric(12,2), ADD COLUMN refund_due_amount numeric(12,2), ADD COLUMN request_hash text;
ALTER TABLE purchase_returns ADD COLUMN debt_reduction_amount numeric(12,2), ADD COLUMN refund_due_amount numeric(12,2), ADD COLUMN request_hash text;
ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_money_snapshot_check CHECK ((debt_reduction_amount IS NULL AND refund_due_amount IS NULL) OR (debt_reduction_amount IS NOT NULL AND refund_due_amount IS NOT NULL AND debt_reduction_amount>=0 AND refund_due_amount>=0 AND debt_reduction_amount+refund_due_amount=total));
ALTER TABLE purchase_returns ADD CONSTRAINT purchase_returns_money_snapshot_check CHECK ((debt_reduction_amount IS NULL AND refund_due_amount IS NULL) OR (debt_reduction_amount IS NOT NULL AND refund_due_amount IS NOT NULL AND debt_reduction_amount>=0 AND refund_due_amount>=0 AND debt_reduction_amount+refund_due_amount=total));
ALTER TABLE suppliers ADD CONSTRAINT suppliers_id_business_unique UNIQUE(id,business_id);
ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_id_business_unique UNIQUE(id,business_id);
ALTER TABLE purchase_returns ADD CONSTRAINT purchase_returns_id_business_unique UNIQUE(id,business_id);
ALTER TABLE sales_settlement_allocations ADD CONSTRAINT sales_allocations_id_business_unique UNIQUE(id,business_id);
ALTER TABLE purchase_settlement_allocations ADD CONSTRAINT purchase_allocations_id_business_unique UNIQUE(id,business_id);
ALTER TABLE sales_settlements ADD CONSTRAINT sales_settlements_id_business_unique UNIQUE(id,business_id);
ALTER TABLE purchase_settlements ADD CONSTRAINT purchase_settlements_id_business_unique UNIQUE(id,business_id);
CREATE TABLE accounting_events (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 side text NOT NULL CHECK(side IN ('sales','purchases')),
 kind text NOT NULL CHECK(kind IN ('advance','advance_apply','advance_refund','return_refund','settlement_reverse','allocation_reverse','money_reverse')),
 customer_id uuid,supplier_id uuid,source_event_id uuid,
 sales_settlement_id uuid,purchase_settlement_id uuid,sales_allocation_id uuid,purchase_allocation_id uuid,sales_return_id uuid,purchase_return_id uuid,
 amount numeric(12,2) NOT NULL CHECK(amount>0),method text,reference text,
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 500),request_hash text NOT NULL,
 created_by text REFERENCES "user"(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,business_id,side),
 FOREIGN KEY(customer_id,business_id) REFERENCES customers(id,business_id),
 FOREIGN KEY(supplier_id,business_id) REFERENCES suppliers(id,business_id),
 FOREIGN KEY(source_event_id,business_id,side) REFERENCES accounting_events(id,business_id,side),
 FOREIGN KEY(sales_settlement_id,business_id) REFERENCES sales_settlements(id,business_id),
 FOREIGN KEY(purchase_settlement_id,business_id) REFERENCES purchase_settlements(id,business_id),
 FOREIGN KEY(sales_allocation_id,business_id) REFERENCES sales_settlement_allocations(id,business_id),
 FOREIGN KEY(purchase_allocation_id,business_id) REFERENCES purchase_settlement_allocations(id,business_id),
 FOREIGN KEY(sales_return_id,business_id) REFERENCES sales_returns(id,business_id),
 FOREIGN KEY(purchase_return_id,business_id) REFERENCES purchase_returns(id,business_id),
 CHECK((side='sales' AND supplier_id IS NULL AND purchase_settlement_id IS NULL AND purchase_allocation_id IS NULL AND purchase_return_id IS NULL) OR (side='purchases' AND customer_id IS NULL AND sales_settlement_id IS NULL AND sales_allocation_id IS NULL AND sales_return_id IS NULL)),
 CHECK((kind IN ('advance_apply','allocation_reverse') AND method IS NULL) OR (kind NOT IN ('advance_apply','allocation_reverse') AND method IS NOT NULL AND method IN ('cash','upi','card','bank','cheque','other'))),
 CHECK((kind='advance' AND source_event_id IS NULL AND num_nonnulls(customer_id,supplier_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)
 OR (kind='advance_apply' AND source_event_id IS NOT NULL AND num_nonnulls(customer_id,supplier_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id)=1 AND num_nonnulls(sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)
 OR (kind IN ('advance_refund','money_reverse') AND source_event_id IS NOT NULL AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)
 OR (kind='return_refund' AND source_event_id IS NULL AND num_nonnulls(sales_return_id,purchase_return_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id)=0)
 OR (kind='settlement_reverse' AND source_event_id IS NULL AND num_nonnulls(sales_settlement_id,purchase_settlement_id)=1 AND num_nonnulls(sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)
 OR (kind='allocation_reverse' AND source_event_id IS NULL AND num_nonnulls(sales_allocation_id,purchase_allocation_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_return_id,purchase_return_id)=0))
);
CREATE UNIQUE INDEX accounting_events_settlement_reverse_sales ON accounting_events(sales_settlement_id) WHERE kind='settlement_reverse';
CREATE UNIQUE INDEX accounting_events_settlement_reverse_purchase ON accounting_events(purchase_settlement_id) WHERE kind='settlement_reverse';
CREATE UNIQUE INDEX accounting_events_allocation_reverse_sales ON accounting_events(sales_allocation_id) WHERE kind='allocation_reverse';
CREATE UNIQUE INDEX accounting_events_allocation_reverse_purchase ON accounting_events(purchase_allocation_id) WHERE kind='allocation_reverse';
CREATE UNIQUE INDEX accounting_events_money_reverse ON accounting_events(source_event_id) WHERE kind='money_reverse';
CREATE UNIQUE INDEX accounting_events_advance_sales ON accounting_events(sales_settlement_id) WHERE kind='advance_apply';
CREATE UNIQUE INDEX accounting_events_advance_purchase ON accounting_events(purchase_settlement_id) WHERE kind='advance_apply';
CREATE INDEX accounting_events_party_sales ON accounting_events(business_id,customer_id,created_at);
CREATE INDEX accounting_events_party_purchase ON accounting_events(business_id,supplier_id,created_at);
CREATE INDEX accounting_events_source ON accounting_events(business_id,source_event_id);
CREATE INDEX accounting_events_return_sales ON accounting_events(business_id,sales_return_id);
CREATE INDEX accounting_events_return_purchase ON accounting_events(business_id,purchase_return_id);
ALTER TABLE accounting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_events FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting_events_tenant ON accounting_events USING(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid) WITH CHECK(business_id=NULLIF(current_setting('app.business_id',true),'')::uuid);
REVOKE ALL ON accounting_events FROM app_user;
GRANT SELECT,INSERT ON accounting_events TO app_user;
