import { sql } from 'drizzle-orm';
import { activeAllocation } from './accounting-evidence';
import { moneyRegister } from './money-queries';
import { sourceEvidence } from './money-sources';
import { type OrderTx, requestHash } from './order-ledger';
import { moneyCents } from './order-policy';
import { type SettlementSide, settlementTables } from './settlement-ledger';
import { settlementRegister } from './settlement-queries';
import { indiaToday } from './stock-batch-policy';
export async function creditAgeing(tx: OrderTx, biz: string, side: SettlementSide) {
  const t = settlementTables(side);
  const [register, money] = await Promise.all([
    settlementRegister(tx, biz, side),
    moneyRegister(tx, biz),
  ]);
  const details = Array.from(
    await tx.execute<{
      id: string;
      name: string;
      day: string;
      due: string | null;
      debt: string;
      mixed: boolean;
      status: string | null;
    }>(sql`SELECT b.id,c.name,to_char(${side === 'sales' ? sql`b.created_at` : sql`b.purchase_date`} AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,${side === 'sales' ? sql`b.due_date::text` : sql`NULL::text`} AS due,${side === 'sales' ? sql`b.payment_status` : sql`NULL::text`} AS status,c.outstanding_balance::text AS debt,
 ${side === 'sales' ? sql`(EXISTS(SELECT 1 FROM emi_schedules e WHERE e.business_id=b.business_id AND e.customer_id=c.id) OR EXISTS(SELECT 1 FROM customer_orders o WHERE o.business_id=b.business_id AND o.customer_id=c.id))` : sql`false`} AS mixed
 FROM ${t.bills} b JOIN ${t.parties} c ON c.id=b.${t.partyId} AND c.business_id=b.business_id WHERE b.business_id=${biz}::uuid AND b.payment_method='credit' ${side === 'sales' ? sql`AND b.status='completed' AND b.bill_type<>'estimate'` : sql``}`),
  );
  const allocations = Array.from(
    await tx.execute<{ bill: string; payment: string; amount: string }>(
      sql`SELECT a.${t.billId}::text AS bill,a.settlement_id::text AS payment,a.amount::text FROM ${t.allocations} a WHERE a.business_id=${biz}::uuid AND ${activeAllocation(side)}`,
    ),
  );
  const advanceLinks = Array.from(
    await tx.execute<{ id: string; source_event_id: string }>(
      sql`SELECT COALESCE(sales_settlement_id,purchase_settlement_id)::text AS id,source_event_id::text FROM accounting_events WHERE business_id=${biz}::uuid AND kind='advance_apply' AND side=${side}`,
    ),
  );
  const cleared = (kind: string, id: string) => {
    const source = money.sources.find((s) => s.source_kind === kind && s.id === id);
    if (!source) return false;
    const hash = requestHash(sourceEvidence(source));
    const amount = money.postings
      .filter(
        (p) =>
          p.source_kind === kind &&
          p.source_id === id &&
          p.source_hash === hash &&
          p.state === 'cleared',
      )
      .reduce((n, p) => n + moneyCents(p.amount), 0);
    return amount === sourceEvidence(source).amount;
  };
  const today = indiaToday();
  const rows = [];
  for (const bill of register.bills) {
    const detail = details.find((d) => d.id === bill.id);
    if (!detail) continue;
    const allocated = allocations
      .filter((a) => a.bill === bill.id)
      .reduce((n, a) => n + moneyCents(a.amount), 0);
    const partyTotal = register.bills
      .filter((b) => b.partyId === bill.partyId)
      .reduce((n, b) => n + moneyCents(b.remaining), 0);
    const reasons: string[] = [];
    if (moneyCents(bill.remaining) < 0)
      reasons.push('Bill allocations or returns exceed recorded bill value');
    if (
      moneyCents(bill.remaining) > 0 &&
      (detail.status === 'paid' || (detail.status === 'partial' && allocated === 0))
    )
      reasons.push('Legacy payment status lacks allocations');
    if (moneyCents(bill.unallocated) !== 0) reasons.push('Party has unallocated payments');
    if (detail.mixed) reasons.push('Party has an order or EMI ledger; reconcile separately');
    else if (moneyCents(detail.debt) !== partyTotal)
      reasons.push('Party debt differs from ordinary credit bills');
    if (
      allocations
        .filter((a) => a.bill === bill.id)
        .some((a) => {
          const advance = advanceLinks.find((x) => x.id === a.payment);
          return !cleared(
            advance
              ? 'accounting_event'
              : side === 'sales'
                ? 'sales_settlement'
                : 'purchase_settlement',
            advance?.source_event_id ?? a.payment,
          );
        })
    )
      reasons.push('Allocated payment money is not fully cleared with current evidence');
    const age = Math.max(0, Math.floor((Date.parse(today) - Date.parse(detail.day)) / 86400000));
    const overdue =
      detail.due && detail.due < today
        ? Math.floor((Date.parse(today) - Date.parse(detail.due)) / 86400000)
        : 0;
    rows.push({
      ...bill,
      ...detail,
      age,
      overdue,
      bucket: age <= 30 ? '0–30' : age <= 60 ? '31–60' : age <= 90 ? '61–90' : '91+',
      reasons,
      consistent: !reasons.length,
    });
  }
  return rows;
}
