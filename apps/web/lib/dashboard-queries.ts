import { type Database, businesses, departments, stores } from '@mybizone/db';
import { asc, eq, sql } from 'drizzle-orm';
import {
  type DashboardGrant,
  type DashboardScope,
  type DashboardSelection,
  dashboardPeriod,
  resolveDashboardScope,
} from './dashboard-policy';

export type DashboardTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function loadDashboardContext(
  tx: DashboardTransaction,
  businessId: string,
  roles: DashboardGrant[],
  selection: DashboardSelection,
  now: Date,
) {
  const [storeRows, departmentRows, businessRows] = await Promise.all([
    tx
      .select({
        id: stores.id,
        name: stores.name,
        businessProfile: stores.businessProfile,
        sellingModel: stores.sellingModel,
      })
      .from(stores)
      .orderBy(asc(stores.name)),
    tx
      .select({ id: departments.id, name: departments.name, storeId: departments.storeId })
      .from(departments)
      .orderBy(asc(departments.name)),
    tx
      .select({
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId)),
  ]);
  const access = resolveDashboardScope(roles, storeRows, departmentRows, selection);
  return { storeRows, businessRows, access, period: dashboardPeriod(access.range, now) };
}

export function scopeCondition(
  scopes: DashboardScope[],
  storeColumn: string,
  departmentColumn: string,
) {
  if (!scopes.length) return sql`FALSE`;
  return sql`(${sql.join(
    scopes.map(
      (scope) =>
        sql`(${scope.storeId ? sql`${sql.raw(storeColumn)}=${scope.storeId}::uuid` : sql`TRUE`} AND ${scope.departmentId ? sql`${sql.raw(departmentColumn)}=${scope.departmentId}::uuid` : sql`TRUE`})`,
    ),
    sql` OR `,
  )})`;
}

export function dashboardSalesQueries(
  businessId: string,
  access: ReturnType<typeof resolveDashboardScope>,
  period: ReturnType<typeof dashboardPeriod>,
) {
  const previousStart = period.previousStart.toISOString();
  const end = period.end.toISOString();
  const lineScope = scopeCondition(access.scopes, 's.store_id', 'p.department_id');
  const sold = sql`SELECT s.id,s.store_id,s.created_at,s.customer_id,s.payment_method,s.payment_status,s.due_date,
    SUM(si.line_total)::numeric AS revenue,SUM(si.qty)::numeric AS units,
    ${access.financial ? sql`SUM(si.qty*COALESCE(si.cost_price_at_sale,0))` : sql`0`}::numeric AS cogs,
    ${access.financial ? sql`SUM(si.gst_amount)` : sql`0`}::numeric AS tax,
    ${access.financial ? sql`COUNT(*) FILTER(WHERE si.cost_price_at_sale IS NULL)` : sql`0`}::int AS missing_costs
    FROM sales s JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
    LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
    WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
      AND s.created_at>=${previousStart}::timestamptz AND s.created_at<${end}::timestamptz AND ${lineScope}
    GROUP BY s.id`;
  const returned = sql`SELECT sr.id,sr.created_at,s.store_id,SUM(ri.line_total)::numeric AS revenue,
    ${access.financial ? sql`SUM(ri.qty*COALESCE(ri.cost_price_at_sale,0))` : sql`0`}::numeric AS cogs,
    ${access.financial ? sql`SUM(ri.gst_amount)` : sql`0`}::numeric AS tax,
    ${access.financial ? sql`COUNT(*) FILTER(WHERE ri.cost_price_at_sale IS NULL)` : sql`0`}::int AS missing_costs
    FROM sales_returns sr JOIN return_items ri ON ri.return_id=sr.id
    JOIN sales s ON s.id=sr.original_sale_id AND s.business_id=sr.business_id
    LEFT JOIN products p ON p.id=ri.product_id AND p.business_id=sr.business_id
    WHERE sr.business_id=${businessId}::uuid AND sr.status='completed'
      AND sr.created_at>=${previousStart}::timestamptz AND sr.created_at<${end}::timestamptz AND ${lineScope}
    GROUP BY sr.id,s.store_id`;
  const unsettled = sql`SELECT DISTINCT s.id,s.due_date FROM sales s
    JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
    LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
    WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
      AND s.payment_status IN ('due','partial','overdue') AND ${lineScope}`;
  return { sold, returned, unsettled, lineScope };
}

export function dashboardUrl(selection: DashboardSelection, analysis = false) {
  const params = new URLSearchParams();
  for (const key of ['view', 'range', 'storeId', 'departmentId'] as const) {
    const value = selection[key];
    if (typeof value === 'string' && value) params.set(key, value);
  }
  return `/dashboard${analysis ? '/analysis' : ''}${params.size ? `?${params}` : ''}`;
}
