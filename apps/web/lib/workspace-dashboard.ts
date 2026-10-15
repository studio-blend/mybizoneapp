import { type Database, departments, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { asc, sql } from 'drizzle-orm';
import {
  type DashboardGrant,
  type DashboardScope,
  type DashboardSelection,
  dashboardPeriod,
  resolveDashboardScope,
} from './dashboard-policy';

export interface SalesSummary {
  revenue: number;
  previousRevenue: number;
  returns: number;
  orders: number;
  units: number;
  customers: number;
  cogs: number;
  unsettled: number;
  overdue: number;
  missingCosts: number;
}
export interface InventorySummary {
  products: number;
  units: number;
  low: number;
  out: number;
  value: number;
}
export interface StockAttention extends Record<string, unknown> {
  id: string;
  name: string;
  store: string;
  department: string | null;
  inventory: number;
  minimum: number;
  unit: string;
}
export interface RecentBill extends Record<string, unknown> {
  id: string | null;
  number: string | null;
  date: string;
  total: number;
  method: string;
  status: string;
  store: string;
  customer: string | null;
}
export interface PerformanceRow extends Record<string, unknown> {
  id: string;
  name: string;
  revenue: number;
  orders: number;
}
export interface LedgerSummary {
  receivables: number;
  payables: number;
  expenses: number;
  previousExpenses: number;
  collections: number;
  supplierPayments: number;
  emiOverdue: number;
}
export interface CustomerSummary {
  total: number;
  new: number;
  tagged: number;
  segments: { name: string; count: number }[];
  recent: { id: string; name: string; date: string; tier: string }[];
  notes: { name: string; note: string; date: string }[];
}
export interface StockMovement extends Record<string, unknown> {
  name: string;
  kind: string;
  quantity: number;
  date: string;
}

function scopeCondition(scopes: DashboardScope[], storeColumn: string, departmentColumn: string) {
  if (!scopes.length) return sql`FALSE`;
  return sql`(${sql.join(
    scopes.map(
      (scope) =>
        sql`(${scope.storeId ? sql`${sql.raw(storeColumn)} = ${scope.storeId}::uuid` : sql`TRUE`} AND ${scope.departmentId ? sql`${sql.raw(departmentColumn)} = ${scope.departmentId}::uuid` : sql`TRUE`})`,
    ),
    sql` OR `,
  )})`;
}
const emptySales: SalesSummary = {
  revenue: 0,
  previousRevenue: 0,
  returns: 0,
  orders: 0,
  units: 0,
  customers: 0,
  cogs: 0,
  unsettled: 0,
  overdue: 0,
  missingCosts: 0,
};
const emptyInventory: InventorySummary = { products: 0, units: 0, low: 0, out: 0, value: 0 };

export async function loadWorkspaceDashboard(
  db: Database,
  businessId: string,
  roles: DashboardGrant[],
  selection: DashboardSelection = {},
  now = new Date(),
) {
  return withTenant(db, businessId, async (tx) => {
    const [storeRows, departmentRows] = await Promise.all([
      tx.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
      tx
        .select({ id: departments.id, name: departments.name, storeId: departments.storeId })
        .from(departments)
        .orderBy(asc(departments.name)),
    ]);
    const access = resolveDashboardScope(roles, storeRows, departmentRows, selection);
    const period = dashboardPeriod(access.range, now);
    const start = period.start.toISOString();
    const end = period.end.toISOString();
    const previousStart = period.previousStart.toISOString();
    const productScope = scopeCondition(access.scopes, 'p.store_id', 'p.department_id');
    const lineScope = scopeCondition(access.scopes, 's.store_id', 'p.department_id');
    const hasSales = !['inventory', 'marketing'].includes(access.view);
    const hasInventory = access.view !== 'marketing';
    const hasLedger = access.globalLedger && ['overview', 'accounts'].includes(access.view);
    const hasCustomers = access.view === 'marketing' && access.globalCustomers;
    const comparisonStores = access.stores.filter((store) =>
      access.scopes.some((scope) => !scope.storeId || scope.storeId === store.id),
    );
    const storeIds = comparisonStores.length
      ? sql.join(
          comparisonStores.map((store) => sql`${store.id}::uuid`),
          sql`, `,
        )
      : sql`NULL::uuid`;
    // Scope line items before aggregation. Mixed-department bills never expose the
    // other department's revenue or product cost to a floor manager.
    const sold = sql`SELECT s.id,s.store_id,s.created_at,s.customer_id,s.payment_method,s.payment_status,s.due_date,
      SUM(si.line_total)::numeric AS revenue,SUM(si.qty)::numeric AS units,
      ${access.financial ? sql`SUM(si.qty * COALESCE(si.cost_price_at_sale,0))` : sql`0`}::numeric AS cogs,
      ${access.financial ? sql`COUNT(*) FILTER(WHERE si.cost_price_at_sale IS NULL)` : sql`0`}::int AS missing_costs
      FROM sales s JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
      LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
      WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
        AND s.created_at>=${previousStart}::timestamptz AND s.created_at<${end}::timestamptz AND ${lineScope}
      GROUP BY s.id`;
    const unsettled = sql`SELECT DISTINCT s.id,s.due_date FROM sales s
      JOIN sale_items si ON si.sale_id=s.id AND si.business_id=s.business_id
      LEFT JOIN products p ON p.id=si.product_id AND p.business_id=s.business_id
      WHERE s.business_id=${businessId}::uuid AND s.status='completed' AND s.bill_type<>'estimate'
        AND s.payment_status IN ('due','partial','overdue') AND ${lineScope}`;
    const returned = sql`SELECT sr.created_at,s.store_id,SUM(ri.line_total)::numeric AS revenue,
      ${access.financial ? sql`SUM(ri.qty * COALESCE(ri.cost_price_at_sale,0))` : sql`0`}::numeric AS cogs
      FROM sales_returns sr JOIN return_items ri ON ri.return_id=sr.id
      JOIN sales s ON s.id=sr.original_sale_id AND s.business_id=sr.business_id
      LEFT JOIN products p ON p.id=ri.product_id AND p.business_id=sr.business_id
      WHERE sr.business_id=${businessId}::uuid AND sr.status='completed'
        AND sr.created_at>=${previousStart}::timestamptz AND sr.created_at<${end}::timestamptz AND ${lineScope}
      GROUP BY sr.id,s.store_id`;
    const [
      summaryRows,
      inventoryRows,
      attention,
      stock,
      recent,
      performance,
      trend,
      methods,
      ledgerRows,
      customerRows,
      movements,
    ] = await Promise.all([
      hasSales
        ? tx.execute<{
            value: SalesSummary;
          }>(sql`WITH sold AS (${sold}), returned AS (${returned}), unsettled AS (${unsettled})
        SELECT json_build_object(
          'revenue',COALESCE((SELECT SUM(revenue) FROM sold WHERE created_at>=${start}::timestamptz),0)-COALESCE((SELECT SUM(revenue) FROM returned WHERE created_at>=${start}::timestamptz),0),
          'previousRevenue',COALESCE((SELECT SUM(revenue) FROM sold WHERE created_at<${start}::timestamptz),0)-COALESCE((SELECT SUM(revenue) FROM returned WHERE created_at<${start}::timestamptz),0),
          'returns',COALESCE((SELECT SUM(revenue) FROM returned WHERE created_at>=${start}::timestamptz),0),
          'orders',(SELECT COUNT(*) FROM sold WHERE created_at>=${start}::timestamptz),
          'units',COALESCE((SELECT SUM(units) FROM sold WHERE created_at>=${start}::timestamptz),0),
          'customers',(SELECT COUNT(DISTINCT customer_id) FROM sold WHERE created_at>=${start}::timestamptz),
          'cogs',COALESCE((SELECT SUM(cogs) FROM sold WHERE created_at>=${start}::timestamptz),0)-COALESCE((SELECT SUM(cogs) FROM returned WHERE created_at>=${start}::timestamptz),0),
          'unsettled',(SELECT COUNT(*) FROM unsettled),
          'overdue',(SELECT COUNT(*) FROM unsettled WHERE due_date<${period.today}::date),
          'missingCosts',COALESCE((SELECT SUM(missing_costs) FROM sold WHERE created_at>=${start}::timestamptz),0)
        ) AS value`)
        : Promise.resolve([]),
      hasInventory
        ? tx.execute<{ value: InventorySummary }>(sql`SELECT json_build_object(
        'products',COUNT(*),'units',COALESCE(SUM(p.inventory),0),
        'low',COUNT(*) FILTER(WHERE p.inventory>0 AND p.min_stock IS NOT NULL AND p.inventory<p.min_stock),
        'out',COUNT(*) FILTER(WHERE p.inventory<=0),
        'value',${access.financial ? sql`COALESCE(SUM(GREATEST(p.inventory,0)*COALESCE(p.cost_price,0)),0)` : sql`0`}) AS value
        FROM products p WHERE p.business_id=${businessId}::uuid AND p.active AND ${productScope}`)
        : Promise.resolve([]),
      hasInventory
        ? tx.execute<StockAttention>(sql`SELECT p.id,p.name,st.name AS store,d.name AS department,
        p.inventory::float8 AS inventory,COALESCE(p.min_stock,0)::float8 AS minimum,p.unit_symbol AS unit
        FROM products p JOIN stores st ON st.id=p.store_id AND st.business_id=p.business_id
        LEFT JOIN departments d ON d.id=p.department_id AND d.business_id=p.business_id
        WHERE p.business_id=${businessId}::uuid AND p.active AND ${productScope} AND (p.inventory<=0 OR p.inventory<p.min_stock)
        ORDER BY p.inventory ASC,p.name LIMIT 6`)
        : Promise.resolve([]),
      access.view === 'inventory' || access.departmentOnly
        ? tx.execute<StockAttention>(sql`SELECT p.id,p.name,st.name AS store,d.name AS department,
        p.inventory::float8 AS inventory,COALESCE(p.min_stock,0)::float8 AS minimum,p.unit_symbol AS unit
        FROM products p JOIN stores st ON st.id=p.store_id AND st.business_id=p.business_id
        LEFT JOIN departments d ON d.id=p.department_id AND d.business_id=p.business_id
        WHERE p.business_id=${businessId}::uuid AND p.active AND ${productScope}
        ORDER BY (p.inventory<=0) DESC,(p.inventory<p.min_stock) DESC,p.name LIMIT 8`)
        : Promise.resolve([]),
      hasSales && access.view !== 'accounts'
        ? tx.execute<RecentBill>(sql`WITH sold AS (${sold})
        SELECT ${access.departmentOnly ? sql`NULL::text` : sql`s.id::text`} AS id,
          ${access.departmentOnly ? sql`NULL::text` : sql`source.bill_no`} AS number,
          s.created_at::text AS date,s.revenue::float8 AS total,s.payment_method AS method,s.payment_status AS status,st.name AS store,
          ${access.departmentOnly ? sql`NULL::text` : sql`source.customer_name`} AS customer
        FROM sold s JOIN sales source ON source.id=s.id JOIN stores st ON st.id=s.store_id
        WHERE s.created_at>=${start}::timestamptz ORDER BY s.created_at DESC,s.id DESC LIMIT 6`)
        : Promise.resolve([]),
      hasSales && ['overview', 'operations'].includes(access.view)
        ? tx.execute<PerformanceRow>(sql`WITH sold AS (${sold}), returned AS (${returned})
        SELECT st.id,st.name,(COALESCE(SUM(s.revenue),0)-COALESCE((SELECT SUM(r.revenue) FROM returned r WHERE r.store_id=st.id AND r.created_at>=${start}::timestamptz),0))::float8 AS revenue,COUNT(s.id)::int AS orders
        FROM stores st LEFT JOIN sold s ON s.store_id=st.id AND s.created_at>=${start}::timestamptz
        WHERE st.business_id=${businessId}::uuid AND st.id IN (${storeIds})
        GROUP BY st.id ORDER BY revenue DESC,st.name LIMIT 20`)
        : Promise.resolve([]),
      hasSales
        ? tx.execute<{
            date: string;
            revenue: number;
          }>(sql`WITH sold AS (${sold}), returned AS (${returned}), movements AS (
          SELECT created_at,revenue FROM sold UNION ALL SELECT created_at,-revenue FROM returned)
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date,SUM(revenue)::float8 AS revenue
        FROM movements WHERE created_at>=${start}::timestamptz GROUP BY 1 ORDER BY 1`)
        : Promise.resolve([]),
      hasSales
        ? tx.execute<{ method: string; amount: number }>(sql`WITH sold AS (${sold})
        SELECT payment_method AS method,SUM(revenue)::float8 AS amount FROM sold
        WHERE created_at>=${start}::timestamptz GROUP BY 1 ORDER BY amount DESC`)
        : Promise.resolve([]),
      hasLedger
        ? tx.execute<{ value: LedgerSummary }>(sql`SELECT json_build_object(
        'receivables',(SELECT COALESCE(SUM(GREATEST(outstanding_balance,0)),0) FROM customers WHERE business_id=${businessId}::uuid),
        'payables',(SELECT COALESCE(SUM(GREATEST(outstanding_balance,0)),0) FROM suppliers WHERE business_id=${businessId}::uuid),
        'expenses',(SELECT COALESCE(SUM(amount),0) FROM expense_entries WHERE business_id=${businessId}::uuid AND type='expense' AND entry_date>=${start}::timestamptz AND entry_date<${end}::timestamptz),
        'previousExpenses',(SELECT COALESCE(SUM(amount),0) FROM expense_entries WHERE business_id=${businessId}::uuid AND type='expense' AND entry_date>=${previousStart}::timestamptz AND entry_date<${start}::timestamptz),
        'collections',(SELECT COALESCE(SUM(amount),0) FROM sales_settlements WHERE business_id=${businessId}::uuid AND settled_at>=${start}::timestamptz AND settled_at<${end}::timestamptz),
        'supplierPayments',(SELECT COALESCE(SUM(amount),0) FROM purchase_settlements WHERE business_id=${businessId}::uuid AND settled_at>=${start}::timestamptz AND settled_at<${end}::timestamptz),
        'emiOverdue',(SELECT COUNT(*) FROM emi_payments WHERE business_id=${businessId}::uuid AND status='pending' AND due_date<${period.today}::date)
      ) AS value`)
        : Promise.resolve([]),
      hasCustomers
        ? tx.execute<{ value: CustomerSummary }>(sql`SELECT json_build_object(
        'total',(SELECT COUNT(*) FROM customers WHERE business_id=${businessId}::uuid),
        'new',(SELECT COUNT(*) FROM customers WHERE business_id=${businessId}::uuid AND created_at>=${start}::timestamptz AND created_at<${end}::timestamptz),
        'tagged',(SELECT COUNT(DISTINCT customer_id) FROM customer_tags WHERE business_id=${businessId}::uuid),
        'segments',COALESCE((SELECT json_agg(x) FROM (SELECT tag AS name,COUNT(DISTINCT customer_id)::int AS count FROM customer_tags WHERE business_id=${businessId}::uuid GROUP BY tag ORDER BY count DESC,tag LIMIT 6) x),'[]'::json),
        'recent',COALESCE((SELECT json_agg(x) FROM (SELECT id,name,created_at::text AS date,rate_category AS tier FROM customers WHERE business_id=${businessId}::uuid ORDER BY created_at DESC,id LIMIT 6) x),'[]'::json),
        'notes',COALESCE((SELECT json_agg(x) FROM (SELECT c.name,n.note,n.created_at::text AS date FROM customer_notes n JOIN customers c ON c.id=n.customer_id AND c.business_id=n.business_id WHERE n.business_id=${businessId}::uuid ORDER BY n.created_at DESC,n.id LIMIT 5) x),'[]'::json)
      ) AS value`)
        : Promise.resolve([]),
      access.view === 'inventory' || access.departmentOnly
        ? tx.execute<StockMovement>(sql`SELECT * FROM (
        SELECT p.name,'Received' AS kind,pi.qty::float8 AS quantity,pu.purchase_date::text AS date
        FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id JOIN products p ON p.id=pi.product_id AND p.business_id=pu.business_id
        WHERE pu.business_id=${businessId}::uuid AND pu.purchase_date>=${start}::timestamptz AND pu.purchase_date<${end}::timestamptz AND ${productScope}
        UNION ALL SELECT p.name,'Damage' AS kind,-dl.qty::float8 AS quantity,dl.logged_at::text AS date
        FROM damage_logs dl JOIN products p ON p.id=dl.product_id AND p.business_id=dl.business_id
        WHERE dl.business_id=${businessId}::uuid AND dl.logged_at>=${start}::timestamptz AND dl.logged_at<${end}::timestamptz AND ${productScope}
      ) x ORDER BY date DESC,name LIMIT 6`)
        : Promise.resolve([]),
    ]);
    const activity = new Map(Array.from(trend).map((row) => [row.date, row.revenue]));
    const dailyTrend: { date: string; revenue: number }[] = [];
    if (hasSales) {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      for (let day = period.start.getTime(); day < period.end.getTime(); day += 86400000) {
        const date = formatter.format(new Date(day));
        dailyTrend.push({ date, revenue: activity.get(date) ?? 0 });
      }
    }
    return {
      access,
      period,
      sales: summaryRows[0]?.value ?? emptySales,
      inventory: inventoryRows[0]?.value ?? emptyInventory,
      attention: Array.from(attention),
      stock: Array.from(stock),
      recent: Array.from(recent),
      performance: Array.from(performance),
      trend: dailyTrend,
      methods: Array.from(methods),
      ledger: ledgerRows[0]?.value ?? null,
      customers: customerRows[0]?.value ?? null,
      movements: Array.from(movements),
    };
  });
}
export type WorkspaceDashboard = Awaited<ReturnType<typeof loadWorkspaceDashboard>>;
