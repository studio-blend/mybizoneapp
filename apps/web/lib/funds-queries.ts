import { sql } from 'drizzle-orm';
import { activeAllocation, eventColumns } from './accounting-evidence';
import type { FundsCommand } from './funds-policy';
import type { OrderTx } from './order-ledger';
import { type SettlementSide, settlementTables } from './settlement-ledger';
import { settlementRegister } from './settlement-queries';
export interface FundsRecord extends Record<string, unknown> {
  id: string;
  partyId: string | null;
  name: string;
  kind: FundsCommand;
  amount: string;
  available: string;
  method: string | null;
  reference: string | null;
  note: string;
  createdAt: Date;
  reversed: boolean;
  sourceId: string | null;
  documentId: string | null;
  documentKind: string;
}
export interface RefundDue extends Record<string, unknown> {
  id: string;
  name: string;
  returnNo: string;
  billNo: string;
  remaining: string;
  total: string;
  partyId: string | null;
}
export async function fundsRegister(tx: OrderTx, businessId: string, side: SettlementSide) {
  const t = settlementTables(side);
  const c = eventColumns(side);
  const parties = Array.from(
    await tx.execute<{ id: string; name: string; outstandingBalance: string }>(
      sql`SELECT id,name,outstanding_balance::text AS "outstandingBalance" FROM ${t.parties} WHERE business_id=${businessId}::uuid ORDER BY name,id`,
    ),
  );
  const events = Array.from(
    await tx.execute<FundsRecord>(sql`SELECT e.id,e.${t.partyId} AS "partyId",COALESCE(p.name,'Walk-in customer / supplier') AS name,e.kind,e.amount::text,e.method,e.reference,e.note,e.created_at AS "createdAt",e.source_event_id AS "sourceId",COALESCE(e.${c.payment},e.${c.allocation},e.${c.returned}) AS "documentId",CASE WHEN e.${c.payment} IS NOT NULL THEN 'payment' WHEN e.${c.allocation} IS NOT NULL THEN 'allocation' ELSE 'return' END AS "documentKind",
 EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND ((x.kind='money_reverse' AND x.source_event_id=e.id) OR (e.kind='advance_apply' AND x.kind='settlement_reverse' AND x.${c.payment}=e.${c.payment}))) AS reversed,
 (CASE WHEN e.kind='advance' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND x.kind='money_reverse' AND x.source_event_id=e.id) THEN e.amount-COALESCE((SELECT sum(a.amount) FROM accounting_events a WHERE a.business_id=e.business_id AND a.source_event_id=e.id AND ((a.kind='advance_refund' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=a.business_id AND x.kind='money_reverse' AND x.source_event_id=a.id)) OR (a.kind='advance_apply' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=a.business_id AND x.kind='settlement_reverse' AND x.${c.payment}=a.${c.payment})))),0) ELSE 0 END)::text AS available
 FROM accounting_events e LEFT JOIN ${t.parties} p ON p.id=e.${t.partyId} AND p.business_id=e.business_id WHERE e.business_id=${businessId}::uuid AND e.side=${side} ORDER BY e.created_at DESC,e.id`),
  );
  const refunds = Array.from(
    await tx.execute<RefundDue>(sql`SELECT r.id,r.${t.partyId} AS "partyId",r.return_no AS "returnNo",b.bill_no AS "billNo",COALESCE(p.name,'Walk-in customer / supplier') AS name,r.total::text,
 (r.refund_due_amount-COALESCE((SELECT sum(e.amount) FROM accounting_events e WHERE e.business_id=r.business_id AND e.${c.returned}=r.id AND e.kind='return_refund' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND x.kind='money_reverse' AND x.source_event_id=e.id)),0))::text AS remaining
 FROM ${t.returns} r JOIN ${t.bills} b ON b.id=r.${t.original} AND b.business_id=r.business_id LEFT JOIN ${t.parties} p ON p.id=r.${t.partyId} AND p.business_id=r.business_id WHERE r.business_id=${businessId}::uuid AND r.status='completed' AND r.refund_due_amount IS NOT NULL AND b.payment_method NOT IN ('order','finance_emi') ORDER BY r.created_at DESC,r.id`),
  );
  const [legacy] = await tx.execute<{ count: number }>(
    sql`SELECT count(*)::int FROM ${t.returns} WHERE business_id=${businessId}::uuid AND status='completed' AND refund_due_amount IS NULL`,
  );
  const register = await settlementRegister(tx, businessId, side);
  const payments = register.payments.filter((p) => !p.reversed);
  const allocations = Array.from(
    await tx.execute<{ id: string; billNo: string; name: string; amount: string }>(
      sql`SELECT a.id,b.bill_no AS "billNo",p.name,a.amount::text FROM ${t.allocations} a JOIN ${t.bills} b ON b.id=a.${t.billId} AND b.business_id=a.business_id JOIN ${t.parties} p ON p.id=a.${t.partyId} AND p.business_id=a.business_id WHERE a.business_id=${businessId}::uuid AND ${activeAllocation(side)} ORDER BY a.created_at DESC,a.id`,
    ),
  );
  return {
    parties,
    events,
    refunds,
    legacyReturns: legacy?.count ?? 0,
    bills: register.bills,
    payments,
    allocations,
  };
}
