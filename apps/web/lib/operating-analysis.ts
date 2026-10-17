import type { Database } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { sql } from 'drizzle-orm';
import {
  DashboardAccessError,
  type DashboardGrant,
  type DashboardSelection,
} from './dashboard-policy';
import { dashboardSalesQueries, loadDashboardContext, scopeCondition } from './dashboard-queries';

export interface AnalysisSelection extends DashboardSelection {
  weekday?: string;
  hour?: string;
}
export interface ActivityDay extends Record<string, unknown> {
  date: string;
  revenue: number;
  profit: number | null;
  missingCosts: number;
  bills: number;
  returns: number;
}
export interface BusyHour extends Record<string, unknown> {
  weekday: number;
  hour: number;
  bills: number;
  revenue: number;
}
export interface CollectionPriority extends Record<string, unknown> {
  id: string;
  name: string;
  balance: number;
  creditLimit: number;
  lastCollection: string | null;
}
export interface AdjustmentSummary {
  kind: 'discount' | 'free' | 'return' | 'damage';
  amount: number | null;
  missingValues: number;
  records: number;
}
export interface AdjustmentProduct extends AdjustmentSummary {
  id: string | null;
  name: string;
  quantity: number;
  unit: string;
}
export interface AnalysisBill extends Record<string, unknown> {
  id: string | null;
  number: string | null;
  date: string;
  revenue: number;
  store: string;
}
export function analysisSlot(selection: AnalysisSelection) {
  const parse = (value: string | undefined, maximum: number, minimum: number) => {
    if (!value) return null;
    if (
      typeof value !== 'string' ||
      !/^\d{1,2}$/.test(value) ||
      Number(value) < minimum ||
      Number(value) > maximum
    )
      throw new DashboardAccessError('Choose a valid weekday and hour for the bill details.');
    return Number(value);
  };
  return { weekday: parse(selection.weekday, 7, 1), hour: parse(selection.hour, 23, 0) };
}
export async function loadOperatingAnalysis(
  db: Database,
  businessId: string,
  roles: DashboardGrant[],
  selection: AnalysisSelection = {},
  now = new Date(),
) {
  return withTenant(db, businessId, async (tx) => {
    const { access, period } = await loadDashboardContext(tx, businessId, roles, selection, now);
    if (access.view === 'marketing')
      throw new DashboardAccessError(
        'Operating analysis is available in sales, store, inventory and accounts workspaces. Open your customer workspace to review customer activity.',
      );
    const slot = analysisSlot(selection);
    const hasSales = access.view !== 'inventory';
    const hasDamage = ['overview', 'operations', 'accounts', 'inventory'].includes(access.view);
    const hasCollections = access.globalLedger && ['overview', 'accounts'].includes(access.view);
    const { sold, returned, lineScope } = dashboardSalesQueries(businessId, access, period);
    const productScope = scopeCondition(access.scopes, 'p.store_id', 'p.department_id');
    const start = period.start.toISOString();
    const end = period.end.toISOString();
    const events = [
      ...(hasSales
        ? [
            sql`SELECT si.product_id AS id,si.product_name AS name,
        CASE WHEN si.is_free_item THEN 'free' ELSE 'discount' END AS kind,
        CASE WHEN si.is_free_item THEN ROUND(si.qty*si.unit_price,2) ELSE GREATEST(ROUND(si.qty*si.unit_price,2)-(si.line_total-si.gst_amount),0) END::numeric AS amount,
        si.qty AS quantity,si.unit_symbol AS unit,0::int AS missing
        FROM sales s JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
        LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
        WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
          AND s.created_at>=${start}::timestamptz AND s.created_at<${end}::timestamptz AND ${lineScope}
          AND (si.is_free_item OR ROUND(si.qty*si.unit_price,2)>(si.line_total-si.gst_amount))`,
            sql`SELECT ri.product_id,ri.product_name,'return',ri.line_total,ri.qty,ri.unit_symbol,0
        FROM sales_returns sr JOIN return_items ri ON ri.return_id=sr.id
        JOIN sales s ON s.id=sr.original_sale_id AND s.business_id=sr.business_id
        LEFT JOIN products p ON p.id=ri.product_id AND p.business_id=sr.business_id
        WHERE sr.business_id=${businessId}::uuid AND sr.status='completed'
          AND sr.created_at>=${start}::timestamptz AND sr.created_at<${end}::timestamptz AND ${lineScope}`,
          ]
        : []),
      ...(hasDamage
        ? [
            sql`SELECT dl.product_id,dl.product_name,'damage',
        ${access.financial ? sql`COALESCE(dl.total_value,ROUND(dl.qty*dl.cost_per_unit,2))` : sql`NULL::numeric`},dl.qty,dl.unit_symbol,
        ${access.financial ? sql`CASE WHEN dl.total_value IS NULL AND dl.cost_per_unit IS NULL THEN 1 ELSE 0 END` : sql`0`}
        FROM damage_logs dl LEFT JOIN products p ON p.id=dl.product_id AND p.business_id=dl.business_id
        WHERE dl.business_id=${businessId}::uuid AND dl.logged_at>=${start}::timestamptz AND dl.logged_at<${end}::timestamptz AND ${productScope}`,
          ]
        : []),
    ];
    const [activityRows, busyRows, collectionRows, adjustmentRows, detailRows] = await Promise.all([
      hasSales
        ? tx.execute<ActivityDay>(sql`WITH sold AS (${sold}), returned AS (${returned}), activity AS (
        SELECT created_at,revenue,cogs,tax,missing_costs,1 AS bills,0::numeric AS returns FROM sold
        UNION ALL SELECT created_at,-revenue,-cogs,-tax,missing_costs,0,revenue FROM returned
      ) SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date,SUM(revenue)::float8 AS revenue,
        ${access.financial ? sql`CASE WHEN SUM(missing_costs)>0 THEN NULL ELSE SUM(revenue-tax-cogs)::float8 END` : sql`NULL::float8`} AS profit,
        SUM(missing_costs)::int AS "missingCosts",SUM(bills)::int AS bills,SUM(returns)::float8 AS returns
        FROM activity GROUP BY 1 ORDER BY 1`)
        : Promise.resolve([]),
      hasSales
        ? tx.execute<BusyHour>(sql`WITH sold AS (${sold})
        SELECT EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS weekday,
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,COUNT(*)::int AS bills,SUM(revenue)::float8 AS revenue
        FROM sold WHERE created_at>=${start}::timestamptz GROUP BY 1,2 ORDER BY 1,2`)
        : Promise.resolve([]),
      hasCollections
        ? tx.execute<CollectionPriority>(sql`SELECT c.id,c.name,c.outstanding_balance::float8 AS balance,c.credit_limit::float8 AS "creditLimit",
        (SELECT MAX(ss.settled_at)::text FROM sales_settlements ss WHERE ss.customer_id=c.id AND ss.business_id=c.business_id AND ss.settled_at<=${now.toISOString()}::timestamptz AND NOT EXISTS(SELECT 1 FROM accounting_events e WHERE e.business_id=ss.business_id AND e.kind='settlement_reverse' AND e.sales_settlement_id=ss.id)) AS "lastCollection"
        FROM customers c WHERE c.business_id=${businessId}::uuid AND c.outstanding_balance>0
        ORDER BY c.outstanding_balance DESC,c.name,c.id LIMIT 8`)
        : Promise.resolve([]),
      tx.execute<{
        value: { summary: AdjustmentSummary[]; products: AdjustmentProduct[] };
      }>(sql`WITH events(id,name,kind,amount,quantity,unit,missing) AS (${sql.join(events, sql` UNION ALL `)}),
        grouped AS (SELECT id,name,kind,unit,SUM(amount)::float8 AS amount,SUM(quantity)::float8 AS quantity,SUM(missing)::int AS "missingValues",COUNT(*)::int AS records
          FROM events GROUP BY id,name,kind,unit),
        ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY amount DESC NULLS LAST,records DESC,name,id) AS rank FROM grouped)
        SELECT json_build_object('summary',COALESCE((SELECT json_agg(x) FROM (
          SELECT kind,SUM(amount)::float8 AS amount,SUM(missing)::int AS "missingValues",COUNT(*)::int AS records FROM events GROUP BY kind ORDER BY kind) x),'[]'::json),
          'products',COALESCE((SELECT json_agg(x ORDER BY kind,rank) FROM (SELECT * FROM ranked WHERE rank<=6) x),'[]'::json)) AS value`),
      hasSales
        ? tx.execute<AnalysisBill>(sql`WITH sold AS (${sold}) SELECT
        ${access.departmentOnly ? sql`NULL::text` : sql`s.id::text`} AS id,
        ${access.departmentOnly ? sql`NULL::text` : sql`source.bill_no`} AS number,s.created_at::text AS date,s.revenue::float8 AS revenue,st.name AS store
        FROM sold s JOIN sales source ON source.id=s.id JOIN stores st ON st.id=s.store_id AND st.business_id=source.business_id
        WHERE s.created_at>=${start}::timestamptz
          AND ${slot.weekday === null ? sql`TRUE` : sql`EXTRACT(ISODOW FROM s.created_at AT TIME ZONE 'Asia/Kolkata')=${slot.weekday}`}
          AND ${slot.hour === null ? sql`TRUE` : sql`EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata')=${slot.hour}`}
        ORDER BY s.created_at DESC,s.id LIMIT 10`)
        : Promise.resolve([]),
    ]);
    const firstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(period.start);
    const activity = Array.from(activityRows);
    const current = activity.filter((row) => row.date >= firstDate);
    const previous = activity.filter((row) => row.date < firstDate);
    const summary = (rows: ActivityDay[]) => ({
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      profit:
        !access.financial || rows.some((row) => row.profit === null)
          ? null
          : rows.reduce((sum, row) => sum + (row.profit ?? 0), 0),
      missingCosts: rows.reduce((sum, row) => sum + row.missingCosts, 0),
      bills: rows.reduce((sum, row) => sum + row.bills, 0),
      returns: rows.reduce((sum, row) => sum + row.returns, 0),
    });
    const byDate = new Map(current.map((row) => [row.date, row]));
    const trend: { date: string; revenue: number; profit?: number | null }[] = [];
    const occurrences = Array.from({ length: 7 }, () => 0);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    for (let time = period.start.getTime(); time < period.end.getTime(); time += 86400000) {
      const date = formatter.format(new Date(time));
      const row = byDate.get(date);
      const weekday = (new Date(`${date}T12:00:00+05:30`).getUTCDay() + 6) % 7;
      occurrences[weekday] = (occurrences[weekday] ?? 0) + 1;
      if (hasSales)
        trend.push({
          date,
          revenue: row?.revenue ?? 0,
          ...(access.financial ? { profit: row ? row.profit : 0 } : {}),
        });
    }
    return {
      access,
      period,
      slot,
      hasSales,
      hasDamage,
      hasCollections,
      trend,
      occurrences,
      summary: summary(current),
      previous: summary(previous),
      busy: Array.from(busyRows),
      collections: Array.from(collectionRows),
      adjustments: adjustmentRows[0]?.value ?? { summary: [], products: [] },
      bills: Array.from(detailRows),
    };
  });
}
export type OperatingAnalysis = Awaited<ReturnType<typeof loadOperatingAnalysis>>;
