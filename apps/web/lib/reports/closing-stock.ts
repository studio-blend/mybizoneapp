import type { Database } from '@mybizone/db';
import { sql } from 'drizzle-orm';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type StockRow = {
  id: string;
  name: string;
  sku: string | null;
  unit_symbol: string;
  category_name: string | null;
  cost_price: string | null;
  closing_qty: string;
  incomplete_adjustments: number;
};

export function validStockDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/** Reconstruct from current inventory, retaining opening stock. Reverse all
 * movements AFTER the selected day's end in India, not the server timezone.
 * Current cost prices are used: this is not a historical inventory costing ledger.
 */
export async function getClosingStock(tx: Transaction, asOfDate: string): Promise<StockRow[]> {
  if (!validStockDate(asOfDate)) throw new Error('invalid stock report date');
  return tx.execute<StockRow>(sql`
    WITH cutoff AS (
      SELECT ((${asOfDate}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS instant
    ), movements AS (
      SELECT pi.product_id, -SUM(pi.qty::numeric) AS delta
      FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id, cutoff
      WHERE pu.purchase_date >= cutoff.instant GROUP BY pi.product_id
      UNION ALL
      SELECT si.product_id, SUM(si.qty::numeric) AS delta
      FROM sale_items si JOIN sales s ON s.id = si.sale_id, cutoff
      WHERE s.created_at >= cutoff.instant AND s.bill_type != 'estimate' AND s.status = 'completed'
      GROUP BY si.product_id
      UNION ALL
      SELECT pri.product_id, SUM(pri.qty::numeric) AS delta
      FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id, cutoff
      WHERE pr.created_at >= cutoff.instant AND pr.status = 'completed' GROUP BY pri.product_id
      UNION ALL
      SELECT ri.product_id, -SUM(ri.qty::numeric) AS delta
      FROM return_items ri JOIN sales_returns sr ON sr.id = ri.return_id, cutoff
      WHERE sr.created_at >= cutoff.instant AND sr.status = 'completed' GROUP BY ri.product_id
      UNION ALL
      SELECT dl.product_id, SUM(dl.qty::numeric) AS delta
      FROM damage_logs dl, cutoff WHERE dl.logged_at >= cutoff.instant GROUP BY dl.product_id
      UNION ALL
      SELECT a.entity_id::uuid AS product_id,
        SUM((a.before->>'inventory')::numeric - (a.after->>'inventory')::numeric) AS delta
      FROM audit_logs a, cutoff
      WHERE a.action = 'product.update' AND a.entity = 'product' AND a.created_at >= cutoff.instant
        AND a.before->>'inventory' ~ '^[0-9]+([.][0-9]+)?$'
        AND a.after->>'inventory' ~ '^[0-9]+([.][0-9]+)?$'
      GROUP BY a.entity_id
    ), corrections AS (
      SELECT product_id, SUM(delta) AS delta FROM movements GROUP BY product_id
    )
    SELECT p.id, p.name, p.sku, p.unit_symbol, c.name AS category_name, p.cost_price,
      (p.inventory + COALESCE(corrections.delta, 0))::text AS closing_qty,
      (SELECT COUNT(*)::integer FROM audit_logs a, cutoff
        WHERE a.entity_id = p.id::text AND a.action = 'product.update' AND a.created_at >= cutoff.instant
          AND (a.before->>'inventory' IS NULL OR a.after->>'inventory' IS NULL)) AS incomplete_adjustments
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN corrections ON corrections.product_id = p.id, cutoff
    WHERE p.business_id = current_setting('app.business_id')::uuid AND p.created_at < cutoff.instant
    ORDER BY p.name
  `);
}
