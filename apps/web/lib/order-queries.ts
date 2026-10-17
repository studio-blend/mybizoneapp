import {
  type Database,
  customerOrderItems,
  customerOrderPayments,
  customerOrders,
  products,
  stores,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { type SQL, and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DashboardGrant, DashboardScope } from './dashboard-policy';
import { scopeCondition } from './dashboard-queries';
import { canReadOrder } from './order-access';
import { type OrderTx, orderLedger } from './order-ledger';
import { moneyCents, orderFulfilment } from './order-policy';
import { indiaToday } from './stock-batch-policy';
import { sellableStockSql } from './stock-batches';
export interface OrderSummaryRow extends Record<string, unknown> {
  id: string;
  orderNo: string;
  storeId: string;
  store: string;
  customer: string;
  promisedOn: string;
  status: string;
  tradeType: string;
  total: string;
  qty: number;
  delivered: number;
  received: string;
  invoiced: string;
  returned: string;
  applied: string;
}
export function orderSummariesSql(businessId: string, predicate: SQL = sql`TRUE`) {
  return sql`SELECT o.id,o.order_no AS "orderNo",o.store_id AS "storeId",st.name AS store,o.customer_name AS customer,o.promised_on::text AS "promisedOn",o.status,o.trade_type AS "tradeType",o.total::text,
 (SELECT sum(i.qty)::float8 FROM customer_order_items i WHERE i.order_id=o.id AND i.business_id=o.business_id) AS qty,
 (SELECT sum(i.delivered_qty)::float8 FROM customer_order_items i WHERE i.order_id=o.id AND i.business_id=o.business_id) AS delivered,
 COALESCE((SELECT sum(CASE p.kind WHEN 'receipt' THEN p.amount ELSE -p.amount END) FROM customer_order_payments p WHERE p.order_id=o.id AND p.business_id=o.business_id),0)::text AS received,
 COALESCE((SELECT sum(s.total) FROM customer_order_deliveries d JOIN sales s ON s.id=d.sale_id AND s.business_id=d.business_id WHERE d.order_id=o.id AND d.business_id=o.business_id),0)::text AS invoiced,
 COALESCE((SELECT sum(r.total) FROM customer_order_deliveries d JOIN sales_returns r ON r.original_sale_id=d.sale_id AND r.business_id=d.business_id AND r.status='completed' WHERE d.order_id=o.id AND d.business_id=o.business_id),0)::text AS returned,
 COALESCE((SELECT sum(a.amount) FROM customer_order_allocations a WHERE a.order_id=o.id AND a.business_id=o.business_id),0)::text AS applied
 FROM customer_orders o JOIN stores st ON st.id=o.store_id AND st.business_id=o.business_id WHERE o.business_id=${businessId}::uuid AND ${predicate}`;
}
export function summarizeOrder(row: OrderSummaryRow) {
  const invoiced = moneyCents(row.invoiced) - moneyCents(row.returned);
  const target =
    row.status === 'cancelled' ? invoiced : moneyCents(row.total) - moneyCents(row.returned);
  const received = moneyCents(row.received);
  return {
    ...row,
    held: received - moneyCents(row.applied),
    due: invoiced - moneyCents(row.applied),
    balance: Math.max(0, target - received),
    refundDue: Math.max(0, received - target),
    state: orderFulfilment(row.status, row.qty, row.delivered),
  };
}
export async function loadOrderList(
  db: Database,
  businessId: string,
  roles: DashboardGrant[],
  query: { storeId?: string; q?: string; view?: string; page?: string; trade?: string },
) {
  return withTenant(db, businessId, async (tx) => {
    const all = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(eq(stores.businessId, businessId))
      .orderBy(asc(stores.name));
    const allowed = all.filter((s) => canReadOrder(roles, s.id));
    if (!allowed.length) throw new Error('Permission denied');
    if (query.storeId && !allowed.some((s) => s.id === query.storeId))
      throw new Error('Store is outside your access');
    const selected = query.storeId ? allowed.filter((s) => s.id === query.storeId) : allowed;
    const scope = sql`o.store_id IN (${sql.join(
      selected.map((s) => sql`${s.id}::uuid`),
      sql`,`,
    )})`;
    const pending = sql`EXISTS(SELECT 1 FROM customer_order_items i WHERE i.order_id=o.id AND i.business_id=o.business_id AND i.delivered_qty<i.qty)`;
    const today = indiaToday();
    const view = ['pending', 'late', 'delivered', 'cancelled'].includes(query.view ?? '')
      ? query.view
      : '';
    const q = query.q?.trim().slice(0, 100) ?? '';
    const trade = ['standard', 'wholesale'].includes(query.trade ?? '') ? query.trade : '';
    const selectedScope = sql`${scope} ${trade ? sql`AND o.trade_type=${trade}` : sql``}`;
    const predicate = sql`${selectedScope} ${q ? sql`AND (o.order_no ILIKE ${`%${q}%`} OR o.customer_name ILIKE ${`%${q}%`})` : sql``}
   ${view === 'pending' ? sql`AND o.status='open' AND ${pending}` : view === 'late' ? sql`AND o.status='open' AND o.promised_on<${today}::date AND ${pending}` : view === 'delivered' ? sql`AND o.status='open' AND NOT ${pending}` : view === 'cancelled' ? sql`AND o.status='cancelled'` : sql``}`;
    const page = /^[1-9]\d{0,3}$/.test(query.page ?? '') ? Number(query.page) : 1;
    const rows = Array.from(
      await tx.execute<OrderSummaryRow>(
        sql`${orderSummariesSql(businessId, predicate)} ORDER BY o.promised_on,o.created_at DESC,o.id LIMIT 50 OFFSET ${(page - 1) * 50}`,
      ),
    );
    const [count] = await tx.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM customer_orders o WHERE o.business_id=${businessId}::uuid AND ${predicate}`,
    );
    const [totals] = await tx.execute<{ orders: number; late: number; held: string; due: string }>(
      sql`WITH v AS (${orderSummariesSql(businessId, selectedScope)}) SELECT count(*) FILTER(WHERE status='open' AND delivered<qty)::int AS orders,count(*) FILTER(WHERE status='open' AND delivered<qty AND "promisedOn"<${today})::int AS late,COALESCE(sum(received::numeric-applied::numeric),0)::text AS held,COALESCE(sum(invoiced::numeric-returned::numeric-applied::numeric),0)::text AS due FROM v`,
    );
    return {
      rows: rows.map(summarizeOrder),
      stores: allowed,
      total: count?.total ?? 0,
      page,
      view,
      q,
      trade,
      storeId: query.storeId ?? '',
      today,
      totals: totals ?? { orders: 0, late: 0, held: '0', due: '0' },
    };
  });
}
export async function loadOrderDetail(
  db: Database,
  businessId: string,
  roles: DashboardGrant[],
  id: string,
) {
  return withTenant(db, businessId, async (tx) => {
    const [order] = await tx
      .select()
      .from(customerOrders)
      .where(and(eq(customerOrders.id, id), eq(customerOrders.businessId, businessId)));
    if (!order) return null;
    if (!canReadOrder(roles, order.storeId)) throw new Error('Permission denied');
    const items = await tx
      .select({
        id: customerOrderItems.id,
        productId: customerOrderItems.productId,
        name: customerOrderItems.productName,
        qty: customerOrderItems.qty,
        delivered: customerOrderItems.deliveredQty,
        unit: customerOrderItems.unitSymbol,
        unitType: customerOrderItems.unitType,
        unitPrice: customerOrderItems.unitPrice,
        packSnapshot: customerOrderItems.packSnapshot,
        total: customerOrderItems.lineTotal,
        serialTracking: products.serialTracking,
        inventory: sellableStockSql,
        availableSerials: sql<
          string[]
        >`ARRAY(SELECT u.code FROM stock_serials u WHERE u.business_id="products".business_id AND u.product_id="products".id AND u.state='available' ORDER BY u.code LIMIT 20)`,
      })
      .from(customerOrderItems)
      .innerJoin(
        products,
        and(
          eq(products.id, customerOrderItems.productId),
          eq(products.businessId, customerOrderItems.businessId),
        ),
      )
      .where(and(eq(customerOrderItems.orderId, id), eq(customerOrderItems.businessId, businessId)))
      .orderBy(asc(customerOrderItems.productName));
    const payments = await tx
      .select()
      .from(customerOrderPayments)
      .where(
        and(
          eq(customerOrderPayments.orderId, id),
          eq(customerOrderPayments.businessId, businessId),
        ),
      )
      .orderBy(desc(customerOrderPayments.createdAt), desc(customerOrderPayments.id))
      .limit(100);
    const [store] = await tx
      .select({ name: stores.name })
      .from(stores)
      .where(and(eq(stores.id, order.storeId), eq(stores.businessId, businessId)));
    return {
      order,
      items,
      payments,
      ledger: await orderLedger(tx, order),
      store: store?.name ?? '',
      today: indiaToday(),
    };
  });
}
export interface OrderAttention extends Record<string, unknown> {
  id: string;
  orderNo: string;
  store: string;
  promisedOn: string;
  units: number;
}
export async function loadDashboardOrders(
  tx: OrderTx,
  businessId: string,
  scopes: DashboardScope[],
  financial: boolean,
  enabled: boolean,
  start: string,
  end: string,
) {
  if (!enabled) return { attention: [] as OrderAttention[], money: null };
  const itemScope = scopeCondition(scopes, 'o.store_id', 'i.department_id');
  const attention = Array.from(
    await tx.execute<OrderAttention>(
      sql`SELECT o.id,o.order_no AS "orderNo",st.name AS store,o.promised_on::text AS "promisedOn",count(*)::int AS units FROM customer_orders o JOIN stores st ON st.id=o.store_id AND st.business_id=o.business_id JOIN customer_order_items i ON i.order_id=o.id AND i.business_id=o.business_id WHERE o.business_id=${businessId}::uuid AND o.status='open' AND i.qty>i.delivered_qty AND ${itemScope} GROUP BY o.id,st.name ORDER BY o.promised_on,o.id LIMIT 6`,
    ),
  );
  // Financial totals require a whole-store scope. Department viewers get quantities only.
  const wholeScopes = scopes.filter((s) => !s.departmentId);
  let money: null | { held: string; due: string; received: string; refunds: string } = null;
  if (financial && wholeScopes.length) {
    const orderScope = scopeCondition(wholeScopes, 'o.store_id', 'NULL');
    const [m] = await tx.execute<{
      held: string;
      due: string;
      received: string;
      refunds: string;
    }>(sql`WITH v AS (${orderSummariesSql(businessId, orderScope)}) SELECT
 COALESCE((SELECT sum(received::numeric-applied::numeric) FROM v),0)::text AS held,
 COALESCE((SELECT sum(invoiced::numeric-returned::numeric-applied::numeric) FROM v),0)::text AS due,
 COALESCE((SELECT sum(p.amount) FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id AND o.business_id=p.business_id WHERE p.business_id=${businessId}::uuid AND p.kind='receipt' AND p.created_at>=${start}::timestamptz AND p.created_at<${end}::timestamptz AND ${orderScope}),0)::text AS received,
 COALESCE((SELECT sum(p.amount) FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id AND o.business_id=p.business_id WHERE p.business_id=${businessId}::uuid AND p.kind='refund' AND p.created_at>=${start}::timestamptz AND p.created_at<${end}::timestamptz AND ${orderScope}),0)::text AS refunds`);
    money = m ?? null;
  }
  return { attention, money };
}
