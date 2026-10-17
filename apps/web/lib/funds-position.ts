import { sql } from 'drizzle-orm';
import type { OrderTx } from './order-ledger';
// Event dates retain historical advance/refund positions. This does not make the
// existing stock, opening-note or cash figures a reconciled balance sheet.
export async function fundsPosition(tx: OrderTx, businessId: string, before: Date) {
  const time = before.toISOString();
  const [r] = await tx.execute<{
    customerAdvances: string;
    supplierAdvances: string;
    customerRefunds: string;
    supplierRefunds: string;
  }>(sql`WITH events AS (SELECT * FROM accounting_events WHERE business_id=${businessId}::uuid AND created_at<${time}::timestamptz), advances AS (
 SELECT a.side,a.amount-COALESCE((SELECT sum(e.amount) FROM events e WHERE e.source_event_id=a.id AND ((e.kind='advance_refund' AND NOT EXISTS(SELECT 1 FROM events x WHERE x.kind='money_reverse' AND x.source_event_id=e.id)) OR (e.kind='advance_apply' AND NOT EXISTS(SELECT 1 FROM events x WHERE x.kind='settlement_reverse' AND (x.sales_settlement_id=e.sales_settlement_id OR x.purchase_settlement_id=e.purchase_settlement_id))))),0) AS available FROM events a WHERE a.kind='advance' AND NOT EXISTS(SELECT 1 FROM events x WHERE x.kind='money_reverse' AND x.source_event_id=a.id)
 ), returns AS (
 SELECT 'sales' AS side,r.refund_due_amount-COALESCE((SELECT sum(e.amount) FROM events e WHERE e.kind='return_refund' AND e.sales_return_id=r.id AND NOT EXISTS(SELECT 1 FROM events x WHERE x.kind='money_reverse' AND x.source_event_id=e.id)),0) AS remaining FROM sales_returns r WHERE r.business_id=${businessId}::uuid AND r.status='completed' AND r.created_at<${time}::timestamptz AND r.refund_due_amount IS NOT NULL
 UNION ALL SELECT 'purchases',r.refund_due_amount-COALESCE((SELECT sum(e.amount) FROM events e WHERE e.kind='return_refund' AND e.purchase_return_id=r.id AND NOT EXISTS(SELECT 1 FROM events x WHERE x.kind='money_reverse' AND x.source_event_id=e.id)),0) FROM purchase_returns r WHERE r.business_id=${businessId}::uuid AND r.status='completed' AND r.created_at<${time}::timestamptz AND r.refund_due_amount IS NOT NULL
 ) SELECT COALESCE((SELECT sum(available) FROM advances WHERE side='sales'),0)::text AS "customerAdvances",COALESCE((SELECT sum(available) FROM advances WHERE side='purchases'),0)::text AS "supplierAdvances",COALESCE((SELECT sum(remaining) FROM returns WHERE side='sales'),0)::text AS "customerRefunds",COALESCE((SELECT sum(remaining) FROM returns WHERE side='purchases'),0)::text AS "supplierRefunds"`);
  return (
    r ?? {
      customerAdvances: '0',
      supplierAdvances: '0',
      customerRefunds: '0',
      supplierRefunds: '0',
    }
  );
}
