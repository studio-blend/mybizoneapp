import { sql } from 'drizzle-orm';
import type { OrderTx } from './order-ledger';
import { indiaToday } from './stock-batch-policy';
export function cashbookRange(from?: string, to?: string) {
  const today = indiaToday();
  const valid = (v: string | undefined) =>
    !!v &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if ((from && !valid(from)) || (to && !valid(to))) throw new Error('Choose valid dates');
  const start = from ?? `${today.slice(0, 7)}-01`;
  const end = to ?? today;
  if (start > end || Date.parse(end) - Date.parse(start) > 365 * 86400000)
    throw new Error('Choose a date range of at most 366 days');
  return { from: start, to: end };
}
export const cashbookMethods = [
  'all',
  'cash',
  'upi',
  'card',
  'bank',
  'cheque',
  'other',
  'unknown',
] as const;
export type CashbookMethod = (typeof cashbookMethods)[number];
export interface CashbookRow extends Record<string, unknown> {
  id: string;
  day: string;
  kind: string;
  label: string;
  method: string;
  incoming: string;
  outgoing: string;
  href: string;
}
// A view of source documents, not a bank ledger: no guessed opening balance,
// allocations are excluded, and return documents do not imply money refunded.
export function cashbookSource(businessId: string) {
  return sql`WITH movements AS (
    SELECT id,created_at AS happened,'Sale' AS kind,bill_no AS label,payment_method AS method,total AS incoming,0::numeric AS outgoing,'/sales/'||id::text AS href FROM sales WHERE business_id=${businessId}::uuid AND status='completed' AND bill_type<>'estimate' AND payment_status='paid' AND payment_method IN ('cash','upi','card','card_debit','card_credit','cheque','other')
    UNION ALL SELECT id,settled_at,'Customer receipt',COALESCE(reference_no,'Receipt'),payment_method,amount,0,'/settlements' FROM sales_settlements WHERE business_id=${businessId}::uuid
    UNION ALL SELECT id,purchase_date,'Purchase',bill_no,payment_method,0,total,'/purchases/'||id::text FROM purchases WHERE business_id=${businessId}::uuid AND payment_method IN ('cash','upi','card','other')
    UNION ALL SELECT id,settled_at,'Supplier payment',COALESCE(reference_no,'Payment'),payment_method,0,amount,'/settlements?tab=purchases' FROM purchase_settlements WHERE business_id=${businessId}::uuid
    UNION ALL SELECT id,created_at,CASE kind WHEN 'receipt' THEN 'Order receipt / advance' ELSE 'Order refund' END,COALESCE(reference,'Order payment'),method,CASE kind WHEN 'receipt' THEN amount ELSE 0 END,CASE kind WHEN 'refund' THEN amount ELSE 0 END,'/orders/'||order_id::text FROM customer_order_payments WHERE business_id=${businessId}::uuid
    UNION ALL SELECT id,created_at,'EMI down payment',finance_company,'unknown',down_payment,0,'/emi/'||id::text FROM emi_schedules WHERE business_id=${businessId}::uuid AND down_payment>0
    UNION ALL SELECT id,paid_date::timestamp AT TIME ZONE 'Asia/Kolkata','EMI instalment','Instalment '||instalment_number::text,COALESCE(payment_method,'unknown'),amount_paid,0,'/emi/'||emi_schedule_id::text FROM emi_payments WHERE business_id=${businessId}::uuid AND status='paid' AND paid_date IS NOT NULL AND amount_paid>0
    UNION ALL SELECT id,entry_date,CASE type WHEN 'income' THEN 'Other income' ELSE 'Expense' END,description,payment_method,CASE type WHEN 'income' THEN amount ELSE 0 END,CASE type WHEN 'expense' THEN amount ELSE 0 END,'/expenses' FROM expense_entries WHERE business_id=${businessId}::uuid AND type IN ('income','expense')
  ), normalized AS (SELECT *,to_char(happened AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,CASE WHEN method IN ('card_debit','card_credit') THEN 'card' WHEN method IN ('bank_transfer','bank') THEN 'bank' WHEN method IN ('cash','upi','card','cheque','other') THEN method ELSE 'unknown' END AS channel FROM movements)`;
}
export async function loadCashbook(
  tx: OrderTx,
  businessId: string,
  from: string,
  to: string,
  method: CashbookMethod,
  page = 1,
) {
  const source = cashbookSource(businessId);
  const condition = sql`day>=${from} AND day<=${to} AND (${method}='all' OR channel=${method})`;
  const rows = Array.from(
    await tx.execute<CashbookRow>(
      sql`${source} SELECT id,day,kind,label,channel AS method,incoming::text,outgoing::text,href FROM normalized WHERE ${condition} ORDER BY happened DESC,kind,id LIMIT 100 OFFSET ${(page - 1) * 100}`,
    ),
  );
  const [totals] = await tx.execute<{ incoming: string; outgoing: string; count: string }>(
    sql`${source} SELECT COALESCE(sum(incoming),0)::text AS incoming,COALESCE(sum(outgoing),0)::text AS outgoing,count(*)::text FROM normalized WHERE ${condition}`,
  );
  const days = Array.from(
    await tx.execute<{ day: string; incoming: string; outgoing: string }>(
      sql`${source} SELECT day,sum(incoming)::text AS incoming,sum(outgoing)::text AS outgoing FROM normalized WHERE ${condition} GROUP BY day ORDER BY day`,
    ),
  );
  const methods = Array.from(
    await tx.execute<{ method: string; incoming: string; outgoing: string }>(
      sql`${source} SELECT channel AS method,sum(incoming)::text AS incoming,sum(outgoing)::text AS outgoing FROM normalized WHERE ${condition} GROUP BY channel ORDER BY channel`,
    ),
  );
  return { rows, totals: totals ?? { incoming: '0', outgoing: '0', count: '0' }, days, methods };
}
