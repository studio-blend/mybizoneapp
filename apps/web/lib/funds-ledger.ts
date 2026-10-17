import { auditLogs } from '@mybizone/db';
import { sql } from 'drizzle-orm';
import { activeAllocation, activePayment, eventColumns } from './accounting-evidence';
import type { FundsCommand } from './funds-policy';
import { type OrderTx, requestHash, unpaidOrderDebt } from './order-ledger';
import { centsText, moneyCents } from './order-policy';
import {
  type SettlementSide,
  allocateSettlement,
  lockSettlementBill,
  settlementBillBalance,
  settlementTables,
  updateSettlementBillStatus,
} from './settlement-ledger';

export interface FundsInput {
  id: string;
  side: SettlementSide;
  kind: FundsCommand;
  partyId?: string;
  sourceId?: string;
  billId?: string;
  amount?: string;
  method?: string;
  reference?: string | null;
  note: string;
}
interface MoneyEvent extends Record<string, unknown> {
  id: string;
  side: SettlementSide;
  kind: FundsCommand;
  customer_id: string | null;
  supplier_id: string | null;
  source_event_id: string | null;
  amount: string;
  method: string | null;
  sales_return_id: string | null;
  purchase_return_id: string | null;
}
export async function accountingEvent(tx: OrderTx, businessId: string, id: string) {
  const [event] = await tx.execute<MoneyEvent>(
    sql`SELECT * FROM accounting_events WHERE id=${id}::uuid AND business_id=${businessId}::uuid`,
  );
  if (!event) throw new Error('Source record not found');
  return event;
}
export async function eventReversed(tx: OrderTx, businessId: string, id: string) {
  const [row] = await tx.execute(
    sql`SELECT id FROM accounting_events WHERE business_id=${businessId}::uuid AND kind='money_reverse' AND source_event_id=${id}::uuid`,
  );
  return !!row;
}
export async function availableAdvance(tx: OrderTx, businessId: string, id: string) {
  const [r] = await tx.execute<{ amount: string }>(
    sql`SELECT (a.amount-COALESCE((SELECT sum(e.amount) FROM accounting_events e WHERE e.business_id=a.business_id AND e.source_event_id=a.id AND ((e.kind='advance_refund' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND x.kind='money_reverse' AND x.source_event_id=e.id)) OR (e.kind='advance_apply' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND x.kind='settlement_reverse' AND (x.sales_settlement_id=e.sales_settlement_id OR x.purchase_settlement_id=e.purchase_settlement_id))))),0))::text AS amount FROM accounting_events a WHERE a.business_id=${businessId}::uuid AND a.id=${id}::uuid AND a.kind='advance' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=a.business_id AND x.kind='money_reverse' AND x.source_event_id=a.id)`,
  );
  if (!r) throw new Error('Advance is unavailable or reversed');
  return moneyCents(r.amount);
}
export async function returnRefundRemaining(
  tx: OrderTx,
  businessId: string,
  side: SettlementSide,
  id: string,
) {
  const t = settlementTables(side);
  const c = eventColumns(side);
  const [r] = await tx.execute<{ due: string | null; paid: string }>(
    sql`SELECT r.refund_due_amount::text AS due,COALESCE((SELECT sum(e.amount) FROM accounting_events e WHERE e.business_id=r.business_id AND e.${c.returned}=r.id AND e.kind='return_refund' AND NOT EXISTS(SELECT 1 FROM accounting_events x WHERE x.business_id=e.business_id AND x.kind='money_reverse' AND x.source_event_id=e.id)),0)::text AS paid FROM ${t.returns} r WHERE r.business_id=${businessId}::uuid AND r.id=${id}::uuid AND r.status='completed'`,
  );
  if (!r || r.due === null)
    throw new Error(
      'Historical return needs refund reconciliation; no refund entitlement is inferred',
    );
  return moneyCents(r.due) - moneyCents(r.paid);
}
function methodOf(value: string | null) {
  const method =
    value === 'bank_transfer'
      ? 'bank'
      : ['card_debit', 'card_credit'].includes(value ?? '')
        ? 'card'
        : value;
  if (!method || !['cash', 'upi', 'card', 'bank', 'cheque', 'other'].includes(method))
    throw new Error('Original payment method needs reconciliation');
  return method;
}
export async function executeFundsCommand(
  tx: OrderTx,
  businessId: string,
  actorId: string,
  input: FundsInput,
) {
  const t = settlementTables(input.side);
  const c = eventColumns(input.side);
  const hash = requestHash({
    ...input,
    amount: input.amount ? centsText(moneyCents(input.amount)) : undefined,
  });
  // One request serializes even if a retry edits its party or source.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${businessId + input.id},0))`);
  const [prior] = await tx.execute<{ request_hash: string }>(
    sql`SELECT request_hash FROM accounting_events WHERE id=${input.id}::uuid AND business_id=${businessId}::uuid`,
  );
  if (prior) {
    if (prior.request_hash !== hash)
      throw new Error('This request was already used with different details');
    return { id: input.id };
  }
  let partyId = input.partyId;
  let billId = input.billId;
  let sourceEvent: MoneyEvent | undefined;
  let paymentId: string | undefined;
  let allocationId: string | undefined;
  let returnId: string | undefined;
  let sourcePayment: { amount: string; method: string; partyId: string } | undefined;
  if (['advance_apply', 'advance_refund', 'money_reverse'].includes(input.kind)) {
    if (!input.sourceId) throw new Error('Choose a source record');
    sourceEvent = await accountingEvent(tx, businessId, input.sourceId);
    if (sourceEvent.side !== input.side) throw new Error('Source belongs to a different ledger');
    partyId = sourceEvent.customer_id ?? sourceEvent.supplier_id ?? undefined;
    if (input.kind !== 'money_reverse' && sourceEvent.kind !== 'advance')
      throw new Error('Choose an advance');
    if (input.kind === 'money_reverse') {
      if (!['advance', 'advance_refund', 'return_refund'].includes(sourceEvent.kind))
        throw new Error('Reverse an advance application through its allocation and settlement');
      returnId = sourceEvent.sales_return_id ?? sourceEvent.purchase_return_id ?? undefined;
    }
  }
  if (input.kind === 'return_refund') returnId = input.sourceId;
  if (returnId) {
    const [r] = await tx.execute<{ partyId: string | null; billId: string | null }>(
      sql`SELECT ${t.partyId} AS "partyId",${t.original} AS "billId" FROM ${t.returns} WHERE id=${returnId}::uuid AND business_id=${businessId}::uuid AND status='completed'`,
    );
    if (!r?.billId) throw new Error('Return source bill not found');
    partyId = r.partyId ?? undefined;
    billId = r.billId;
  }
  if (input.kind === 'allocation_reverse') {
    if (!input.sourceId) throw new Error('Choose an allocation');
    allocationId = input.sourceId;
    const [a] = await tx.execute<{ partyId: string; billId: string }>(
      sql`SELECT ${t.partyId} AS "partyId",${t.billId} AS "billId" FROM ${t.allocations} WHERE id=${allocationId}::uuid AND business_id=${businessId}::uuid`,
    );
    if (!a) throw new Error('Allocation not found');
    partyId = a.partyId;
    billId = a.billId;
  }
  if (input.kind === 'settlement_reverse') {
    if (!input.sourceId) throw new Error('Choose a settlement');
    paymentId = input.sourceId;
    [sourcePayment] = await tx.execute<{ amount: string; method: string; partyId: string }>(
      sql`SELECT amount::text,payment_method AS method,${t.partyId} AS "partyId" FROM ${t.payments} WHERE id=${paymentId}::uuid AND business_id=${businessId}::uuid`,
    );
    if (!sourcePayment) throw new Error('Settlement not found');
    partyId = sourcePayment.partyId;
  }
  if (billId) {
    if (input.kind === 'advance_apply' || input.kind === 'allocation_reverse')
      await lockSettlementBill(tx, businessId, input.side, billId, partyId);
    else {
      const [bill] = await tx.execute<{ method: string }>(
        sql`SELECT payment_method AS method FROM ${t.bills} WHERE id=${billId}::uuid AND business_id=${businessId}::uuid FOR UPDATE`,
      );
      if (!bill || ['order', 'finance_emi'].includes(bill.method))
        throw new Error('Use the order or EMI ledger for this refund');
    }
  }
  if (partyId) {
    const [p] = await tx.execute(
      sql`SELECT id FROM ${t.parties} WHERE id=${partyId}::uuid AND business_id=${businessId}::uuid FOR UPDATE`,
    );
    if (!p) throw new Error('Party not found');
  } else if (!returnId) throw new Error('Choose a customer or supplier');
  if (sourceEvent && (await eventReversed(tx, businessId, sourceEvent.id)))
    throw new Error('Source record is already reversed');
  let amount = input.amount ? moneyCents(input.amount) : 0;
  let method: string | null = null;
  if (input.kind === 'advance') method = methodOf(input.method ?? null);
  else if (input.kind === 'advance_apply') {
    if (!sourceEvent || !billId || !partyId) throw new Error('Choose an advance and credit bill');
    if (amount > (await availableAdvance(tx, businessId, sourceEvent.id)))
      throw new Error('Amount exceeds unused advance');
    const balance = await settlementBillBalance(tx, businessId, input.side, billId);
    if (balance.unreconciledStatus)
      throw new Error('Bill payment history needs allocation reconciliation');
    if (amount > balance.remaining) throw new Error('Amount exceeds remaining bill value');
    const [p] = await tx.execute<{ debt: string }>(
      sql`SELECT outstanding_balance::text AS debt FROM ${t.parties} WHERE id=${partyId}::uuid AND business_id=${businessId}::uuid`,
    );
    let debt = moneyCents(p?.debt ?? '0');
    if (input.side === 'sales') {
      const [reserved] = await tx.execute<{ amount: string }>(
        sql`SELECT COALESCE(sum(round((s.principal_amount-s.down_payment)*p.instalment_number/s.tenure_months,2)-round((s.principal_amount-s.down_payment)*(p.instalment_number-1)/s.tenure_months,2)),0)::text AS amount FROM emi_schedules s JOIN emi_payments p ON p.emi_schedule_id=s.id AND p.business_id=s.business_id WHERE s.business_id=${businessId}::uuid AND s.customer_id=${partyId}::uuid AND p.status<>'paid'`,
      );
      debt -=
        moneyCents(reserved?.amount ?? '0') + (await unpaidOrderDebt(tx, businessId, partyId));
    }
    if (amount > debt)
      throw new Error(
        'Amount exceeds general party debt; use the order or EMI ledger for those bills',
      );
    paymentId = input.id;
    await tx.execute(
      sql`INSERT INTO ${t.payments}(id,business_id,${t.partyId},amount,payment_method,reference_no,notes,request_hash,created_by) VALUES(${paymentId}::uuid,${businessId}::uuid,${partyId}::uuid,${centsText(amount)}::numeric,${methodOf(sourceEvent.method)},${input.reference ?? null},${input.note},${hash},${actorId})`,
    );
    await allocateSettlement(tx, {
      id: input.id,
      businessId,
      actorId,
      side: input.side,
      settlementId: paymentId,
      billId,
      amount: centsText(amount),
      note: input.note,
    });
    await tx.execute(
      sql`UPDATE ${t.parties} SET outstanding_balance=outstanding_balance-${centsText(amount)}::numeric,updated_at=now() WHERE id=${partyId}::uuid AND business_id=${businessId}::uuid`,
    );
  } else if (input.kind === 'advance_refund') {
    if (!sourceEvent || amount > (await availableAdvance(tx, businessId, sourceEvent.id)))
      throw new Error('Amount exceeds unused advance');
    method = methodOf(input.method ?? null);
  } else if (input.kind === 'return_refund') {
    if (!returnId || amount > (await returnRefundRemaining(tx, businessId, input.side, returnId)))
      throw new Error('Amount exceeds refund still due');
    method = methodOf(input.method ?? null);
  } else if (input.kind === 'allocation_reverse') {
    const [a] = await tx.execute<{ amount: string }>(
      sql`SELECT a.amount::text FROM ${t.allocations} a WHERE a.id=${allocationId}::uuid AND a.business_id=${businessId}::uuid AND ${activeAllocation(input.side)}`,
    );
    if (!a) throw new Error('Allocation is already reversed');
    amount = moneyCents(a.amount);
    const [paidReturn] = await tx.execute(
      sql`SELECT id FROM ${t.returns} WHERE ${t.original}=${billId}::uuid AND business_id=${businessId}::uuid AND status='completed' AND refund_due_amount>0`,
    );
    if (paidReturn)
      throw new Error(
        'Allocation supports a paid return; reconcile that return before changing payment evidence',
      );
  } else if (input.kind === 'settlement_reverse') {
    const [p] = await tx.execute(
      sql`SELECT p.id FROM ${t.payments} p WHERE p.id=${paymentId}::uuid AND p.business_id=${businessId}::uuid AND ${activePayment(input.side)}`,
    );
    if (!p || !sourcePayment) throw new Error('Settlement is already reversed');
    const [allocated] = await tx.execute(
      sql`SELECT a.id FROM ${t.allocations} a WHERE a.settlement_id=${paymentId}::uuid AND a.business_id=${businessId}::uuid AND ${activeAllocation(input.side)} LIMIT 1`,
    );
    if (allocated) throw new Error('Reverse the bill allocations before reversing this settlement');
    amount = moneyCents(sourcePayment.amount);
    method = methodOf(sourcePayment.method);
    await tx.execute(
      sql`UPDATE ${t.parties} SET outstanding_balance=outstanding_balance+${centsText(amount)}::numeric,updated_at=now() WHERE id=${partyId}::uuid AND business_id=${businessId}::uuid`,
    );
  } else if (input.kind === 'money_reverse') {
    if (!sourceEvent) throw new Error('Choose an advance or refund');
    amount = moneyCents(sourceEvent.amount);
    method = methodOf(sourceEvent.method);
    if (
      sourceEvent.kind === 'advance' &&
      (await availableAdvance(tx, businessId, sourceEvent.id)) !== amount
    )
      throw new Error('Reverse the advance applications and refunds first');
    // Do not copy a return link into the reversal: its source event retains provenance.
    returnId = undefined;
  }
  if (amount <= 0) throw new Error('Amount must be greater than zero');
  await tx.execute(
    sql`INSERT INTO accounting_events(id,business_id,side,kind,customer_id,supplier_id,source_event_id,${c.payment},${c.allocation},${c.returned},amount,method,reference,note,request_hash,created_by) VALUES(${input.id}::uuid,${businessId}::uuid,${input.side},${input.kind},${input.side === 'sales' ? (partyId ?? null) : null}::uuid,${input.side === 'purchases' ? (partyId ?? null) : null}::uuid,${sourceEvent?.id ?? null}::uuid,${paymentId ?? null}::uuid,${allocationId ?? null}::uuid,${returnId ?? null}::uuid,${centsText(amount)}::numeric,${method},${input.reference ?? null},${input.note},${hash},${actorId})`,
  );
  if (input.kind === 'allocation_reverse' && input.side === 'sales' && billId)
    await updateSettlementBillStatus(tx, businessId, billId);
  await tx.insert(auditLogs).values({
    businessId,
    actorId,
    action: `accounting.${input.kind}`,
    entity: 'accounting_event',
    entityId: input.id,
    after: { ...input, amount: centsText(amount) },
  });
  return { id: input.id };
}
