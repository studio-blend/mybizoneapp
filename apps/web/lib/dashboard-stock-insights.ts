import type { Database } from '@mybizone/db';
import { type SQL, sql } from 'drizzle-orm';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ProductProfit extends Record<string, unknown> {
  id: string | null;
  name: string;
  revenue: number;
  profit: number | null;
  missingCosts: number;
}
export interface StockInsight extends Record<string, unknown> {
  id: string;
  name: string;
  store: string;
  inventory: number;
  unit: string;
  value: number | null;
  lastSale: string | null;
  idleDays: number;
  slowDays: number;
  daysRemaining: number | null;
  kind: 'slow' | 'cover';
}

export async function loadDashboardStockInsights(
  tx: Transaction,
  options: {
    businessId: string;
    start: string;
    end: string;
    today: string;
    productScope: SQL;
    lineScope: SQL;
    financial: boolean;
    inventory: boolean;
    slowThresholds: { id: string; days: number }[];
  },
) {
  const { businessId, start, end, today, productScope, lineScope, financial, inventory } = options;
  const slowThreshold = options.slowThresholds.length
    ? sql`CASE ${sql.join(
        options.slowThresholds.map(
          (store) => sql`WHEN p.store_id=${store.id}::uuid THEN ${store.days}::int`,
        ),
        sql` `,
      )} ELSE 30 END`
    : sql`30`;
  const [profit, stock] = await Promise.all([
    financial
      ? tx.execute<ProductProfit>(sql`WITH movements AS (
      SELECT si.product_id,si.product_name,si.line_total AS revenue,si.qty*si.cost_price_at_sale AS cost,si.cost_price_at_sale IS NULL AS missing
      FROM sales s JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
      LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
      WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
        AND s.created_at>=${start}::timestamptz AND s.created_at<${end}::timestamptz AND ${lineScope}
      UNION ALL
      SELECT ri.product_id,ri.product_name,-ri.line_total,-ri.qty*ri.cost_price_at_sale,ri.cost_price_at_sale IS NULL
      FROM sales_returns sr JOIN return_items ri ON ri.return_id=sr.id
      JOIN sales s ON s.id=sr.original_sale_id AND s.business_id=sr.business_id
      LEFT JOIN products p ON p.id=ri.product_id AND p.business_id=sr.business_id
      WHERE sr.business_id=${businessId}::uuid AND sr.status='completed'
        AND sr.created_at>=${start}::timestamptz AND sr.created_at<${end}::timestamptz AND ${lineScope}
    ) SELECT product_id::text AS id,MAX(product_name) AS name,SUM(revenue)::float8 AS revenue,
      CASE WHEN BOOL_OR(missing) THEN NULL ELSE SUM(revenue-cost)::float8 END AS profit,
      COUNT(*) FILTER(WHERE missing)::int AS "missingCosts"
      FROM movements GROUP BY product_id,CASE WHEN product_id IS NULL THEN product_name END
      ORDER BY profit DESC NULLS LAST,name LIMIT 6`)
      : Promise.resolve([]),
    inventory
      ? tx.execute<StockInsight>(sql`WITH scoped AS (
      SELECT p.id,p.name,st.name AS store,p.inventory,p.unit_symbol AS unit,
        ${financial ? sql`(p.inventory*p.cost_price)::float8` : sql`NULL::float8`} AS value,
        activity.last_sale,
        GREATEST(0,${today}::date-(COALESCE(activity.last_sale,p.created_at) AT TIME ZONE 'Asia/Kolkata')::date)::int AS idle_days,
        ${slowThreshold}::int AS slow_days,
        CASE WHEN p.created_at<=${end}::timestamptz-INTERVAL '14 days' AND activity.sold_qty>0
          THEN ROUND(p.inventory / (activity.sold_qty / LEAST(30::numeric,GREATEST(1::numeric,EXTRACT(EPOCH FROM (${end}::timestamptz-p.created_at))/86400))),1)::float8
          ELSE NULL END AS days_remaining
      FROM products p JOIN stores st ON st.id=p.store_id AND st.business_id=p.business_id
      LEFT JOIN LATERAL (
        SELECT MAX(s.created_at) AS last_sale,
          COALESCE(SUM(si.qty) FILTER(WHERE s.created_at>=${end}::timestamptz-INTERVAL '30 days'),0)::numeric AS sold_qty
        FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.business_id=si.business_id
        WHERE si.product_id=p.id AND si.business_id=p.business_id AND s.store_id=p.store_id
          AND s.status='completed' AND s.bill_type<>'estimate' AND s.created_at<${end}::timestamptz
      ) activity ON TRUE
      WHERE p.business_id=${businessId}::uuid AND p.active AND p.inventory>0 AND ${productScope}
    ), candidates AS (
      SELECT *,'slow' AS kind FROM scoped WHERE idle_days>=slow_days
      UNION ALL SELECT *,'cover' AS kind FROM scoped WHERE days_remaining IS NOT NULL
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY
        CASE WHEN kind='slow' THEN idle_days END DESC,
        CASE WHEN kind='cover' THEN days_remaining END ASC,id) AS rank FROM candidates
    ) SELECT id,name,store,inventory::float8 AS inventory,unit,value,kind,last_sale::text AS "lastSale",
      idle_days AS "idleDays",slow_days AS "slowDays",days_remaining AS "daysRemaining"
      FROM ranked WHERE rank<=6 ORDER BY kind,rank`)
      : Promise.resolve([]),
  ]);
  return {
    profit: Array.from(profit),
    slow: Array.from(stock).filter((row) => row.kind === 'slow'),
    cover: Array.from(stock).filter((row) => row.kind === 'cover'),
  };
}
