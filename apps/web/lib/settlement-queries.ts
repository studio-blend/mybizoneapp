import { sql } from 'drizzle-orm';
import { activeAllocation, activePayment } from './accounting-evidence';
import type { OrderTx } from './order-ledger';
import { type SettlementSide, settlementTables } from './settlement-ledger';

export interface SettlementBill extends Record<string, unknown> {
  id: string;
  partyId: string;
  billNo: string;
  remaining: string;
  unallocated: string;
}
export interface SettlementPayment extends Record<string, unknown> {
  id: string;
  partyId: string;
  name: string;
  amount: string;
  unallocated: string;
  reversed: boolean;
  method: string;
  settledAt: Date;
  reference: string | null;
}
export async function settlementRegister(tx: OrderTx, businessId: string, side: SettlementSide) {
  const t = settlementTables(side);
  const bills = Array.from(
    await tx.execute<SettlementBill>(sql`SELECT b.id,b.${t.partyId} AS "partyId",b.bill_no AS "billNo",
  (b.total-COALESCE((SELECT sum(r.total-COALESCE(r.refund_due_amount,0)) FROM ${t.returns} r WHERE r.${t.original}=b.id AND r.business_id=b.business_id AND r.status='completed'),0)
  -COALESCE((SELECT sum(a.amount) FROM ${t.allocations} a WHERE a.${t.billId}=b.id AND a.business_id=b.business_id AND ${activeAllocation(side)}),0))::text AS remaining,
  COALESCE((SELECT sum(p.amount-COALESCE((SELECT sum(a.amount) FROM ${t.allocations} a WHERE a.settlement_id=p.id AND a.business_id=p.business_id AND ${activeAllocation(side)}),0)) FROM ${t.payments} p WHERE p.${t.partyId}=b.${t.partyId} AND p.business_id=b.business_id AND ${activePayment(side)}),0)::text AS unallocated
  FROM ${t.bills} b WHERE b.business_id=${businessId}::uuid AND b.payment_method='credit' AND b.${t.partyId} IS NOT NULL
  ${side === 'sales' ? sql`AND b.status='completed' AND b.bill_type<>'estimate'` : sql``} ORDER BY b.created_at,b.id`),
  );
  const payments = Array.from(
    await tx.execute<SettlementPayment>(sql`SELECT p.id,NOT (${activePayment(side)}) AS reversed,p.${t.partyId} AS "partyId",c.name,p.amount::text,
  (CASE WHEN ${activePayment(side)} THEN p.amount-COALESCE((SELECT sum(a.amount) FROM ${t.allocations} a WHERE a.settlement_id=p.id AND a.business_id=p.business_id AND ${activeAllocation(side)}),0) ELSE 0 END)::text AS unallocated,
  p.payment_method AS method,p.settled_at AS "settledAt",p.reference_no AS reference
  FROM ${t.payments} p JOIN ${t.parties} c ON c.id=p.${t.partyId} AND c.business_id=p.business_id WHERE p.business_id=${businessId}::uuid ORDER BY p.settled_at DESC,p.id`),
  );
  const allocations = Array.from(
    await tx.execute<{
      id: string;
      reversed: boolean;
      billNo: string;
      name: string;
      amount: string;
      note: string;
      createdAt: Date;
    }>(sql`SELECT a.id,NOT (${activeAllocation(side)}) AS reversed,b.bill_no AS "billNo",c.name,a.amount::text,a.note,a.created_at AS "createdAt"
    FROM ${t.allocations} a JOIN ${t.bills} b ON b.id=a.${t.billId} AND b.business_id=a.business_id
    JOIN ${t.parties} c ON c.id=a.${t.partyId} AND c.business_id=a.business_id WHERE a.business_id=${businessId}::uuid ORDER BY a.created_at DESC,a.id LIMIT 100`),
  );
  return { bills, payments, allocations };
}
