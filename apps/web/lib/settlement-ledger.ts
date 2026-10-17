import { randomUUID } from 'node:crypto';
import { auditLogs } from '@mybizone/db';
import { sql } from 'drizzle-orm';
import { activeAllocation, activePayment } from './accounting-evidence';
import { type OrderTx, requestHash } from './order-ledger';
import { centsText, moneyCents } from './order-policy';

export type SettlementSide = 'sales' | 'purchases';
// Identifiers come only from this fixed map, never from request text.
export function settlementTables(side: SettlementSide) {
  const sale = side === 'sales';
  return {
    bills: sql.identifier(sale ? 'sales' : 'purchases'),
    payments: sql.identifier(sale ? 'sales_settlements' : 'purchase_settlements'),
    allocations: sql.identifier(
      sale ? 'sales_settlement_allocations' : 'purchase_settlement_allocations',
    ),
    returns: sql.identifier(sale ? 'sales_returns' : 'purchase_returns'),
    original: sql.identifier(sale ? 'original_sale_id' : 'original_purchase_id'),
    billId: sql.identifier(sale ? 'sale_id' : 'purchase_id'),
    partyId: sql.identifier(sale ? 'customer_id' : 'supplier_id'),
    parties: sql.identifier(sale ? 'customers' : 'suppliers'),
  };
}
export async function lockSettlementBill(
  tx: OrderTx,
  businessId: string,
  side: SettlementSide,
  id: string,
  partyId?: string,
) {
  const t = settlementTables(side);
  const [bill] = await tx.execute<{
    id: string;
    partyId: string;
    paymentMethod: string;
    total: string;
    valid: boolean;
  }>(sql`
    SELECT id,${t.partyId} AS "partyId",payment_method AS "paymentMethod",total::text,
    ${side === 'sales' ? sql`(status='completed' AND bill_type<>'estimate')` : sql`true`} AS valid
    FROM ${t.bills} WHERE id=${id}::uuid AND business_id=${businessId}::uuid FOR UPDATE`);
  if (
    !bill ||
    !bill.valid ||
    bill.paymentMethod !== 'credit' ||
    !bill.partyId ||
    (partyId && bill.partyId !== partyId)
  )
    throw new Error(
      'Choose a credit bill for this party; use the order or EMI ledger for those bills',
    );
  return bill;
}
export async function settlementBillBalance(
  tx: OrderTx,
  businessId: string,
  side: SettlementSide,
  id: string,
) {
  const t = settlementTables(side);
  const [row] = await tx.execute<{
    total: string;
    returned: string;
    allocated: string;
    paymentStatus: string | null;
  }>(sql`
    SELECT b.total::text,${side === 'sales' ? sql`b.payment_status` : sql`NULL::text`} AS "paymentStatus",
    COALESCE((SELECT sum(r.total-COALESCE(r.refund_due_amount,0)) FROM ${t.returns} r WHERE r.business_id=b.business_id AND r.${t.original}=b.id AND r.status='completed'),0)::text AS returned,
    COALESCE((SELECT sum(a.amount) FROM ${t.allocations} a WHERE a.business_id=b.business_id AND a.${t.billId}=b.id AND ${activeAllocation(side)}),0)::text AS allocated
    FROM ${t.bills} b WHERE b.id=${id}::uuid AND b.business_id=${businessId}::uuid`);
  if (!row) throw new Error('Bill not found');
  const net = moneyCents(row.total) - moneyCents(row.returned);
  const allocated = moneyCents(row.allocated);
  if (net < 0 || allocated > net) throw new Error('Bill requires reconciliation');
  const unreconciledStatus =
    side === 'sales' &&
    net > allocated &&
    (row.paymentStatus === 'paid' || (row.paymentStatus === 'partial' && allocated === 0));
  return { net, allocated, remaining: net - allocated, unreconciledStatus };
}
export async function unallocatedSettlements(
  tx: OrderTx,
  businessId: string,
  side: SettlementSide,
  partyId: string,
) {
  const t = settlementTables(side);
  const [row] = await tx.execute<{ amount: string }>(
    sql`SELECT COALESCE(sum(p.amount-COALESCE((SELECT sum(a.amount) FROM ${t.allocations} a WHERE a.settlement_id=p.id AND a.business_id=p.business_id AND ${activeAllocation(side)}),0)),0)::text AS amount FROM ${t.payments} p WHERE p.business_id=${businessId}::uuid AND p.${t.partyId}=${partyId}::uuid AND ${activePayment(side)}`,
  );
  return moneyCents(row?.amount ?? '0');
}
export async function updateSettlementBillStatus(tx: OrderTx, businessId: string, id: string) {
  const b = await settlementBillBalance(tx, businessId, 'sales', id);
  await tx.execute(
    sql`UPDATE sales SET payment_status=${b.remaining === 0 ? 'paid' : b.allocated > 0 ? 'partial' : 'due'},updated_at=now() WHERE id=${id}::uuid AND business_id=${businessId}::uuid`,
  );
}
export async function allocateSettlement(
  tx: OrderTx,
  input: {
    id: string;
    businessId: string;
    actorId: string;
    side: SettlementSide;
    settlementId: string;
    billId: string;
    amount: string;
    note: string;
  },
) {
  const t = settlementTables(input.side);
  const hash = requestHash({
    side: input.side,
    settlementId: input.settlementId,
    billId: input.billId,
    amount: centsText(moneyCents(input.amount)),
    note: input.note,
  });
  // The bill is locked before the party, matching credit returns. The party
  // lock serializes every allocation from its immutable payment documents.
  const bill = await lockSettlementBill(tx, input.businessId, input.side, input.billId);
  await tx.execute(
    sql`SELECT id FROM ${t.parties} WHERE id=${bill.partyId}::uuid AND business_id=${input.businessId}::uuid FOR UPDATE`,
  );
  const [payment] = await tx.execute<{ amount: string; partyId: string }>(
    sql`SELECT p.amount::text,p.${t.partyId} AS "partyId" FROM ${t.payments} p WHERE p.id=${input.settlementId}::uuid AND p.business_id=${input.businessId}::uuid AND ${activePayment(input.side)}`,
  );
  if (!payment || payment.partyId !== bill.partyId)
    throw new Error('Payment and bill must belong to the same party');
  const [old] = await tx.execute<{ requestHash: string }>(
    sql`SELECT request_hash AS "requestHash" FROM ${t.allocations} WHERE id=${input.id}::uuid AND business_id=${input.businessId}::uuid`,
  );
  if (old) {
    if (old.requestHash !== hash)
      throw new Error('This allocation request was already used with different details');
    return { id: input.id };
  }
  const [used] = await tx.execute<{ amount: string }>(
    sql`SELECT COALESCE(sum(a.amount),0)::text AS amount FROM ${t.allocations} a WHERE a.settlement_id=${input.settlementId}::uuid AND a.business_id=${input.businessId}::uuid AND ${activeAllocation(input.side)}`,
  );
  const balance = await settlementBillBalance(tx, input.businessId, input.side, input.billId);
  const amount = moneyCents(input.amount);
  if (
    amount <= 0 ||
    amount > moneyCents(payment.amount) - moneyCents(used?.amount ?? '0') ||
    amount > balance.remaining
  )
    throw new Error('Allocation exceeds the unallocated payment or remaining bill value');
  await tx.execute(
    sql`INSERT INTO ${t.allocations}(id,business_id,${t.partyId},settlement_id,${t.billId},amount,note,request_hash,created_by) VALUES(${input.id}::uuid,${input.businessId}::uuid,${bill.partyId}::uuid,${input.settlementId}::uuid,${input.billId}::uuid,${input.amount}::numeric,${input.note},${hash},${input.actorId})`,
  );
  if (input.side === 'sales') await updateSettlementBillStatus(tx, input.businessId, input.billId);
  await tx.insert(auditLogs).values({
    businessId: input.businessId,
    actorId: input.actorId,
    action: 'settlement.allocate',
    entity: input.side === 'sales' ? 'sales_settlement' : 'purchase_settlement',
    entityId: input.settlementId,
    after: {
      allocationId: input.id,
      billId: input.billId,
      amount: input.amount,
      note: input.note,
    },
  });
  return { id: input.id };
}
export const newAllocationId = () => randomUUID();
