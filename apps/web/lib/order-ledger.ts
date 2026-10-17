import { createHash } from 'node:crypto';
import {
  type Database,
  customerOrderAllocations,
  customerOrders,
  customers,
  sales,
} from '@mybizone/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { centsText, moneyCents } from './order-policy';
export type OrderTx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Order = typeof customerOrders.$inferSelect;
export const requestHash = (input: unknown) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');
export async function lockOrder(tx: OrderTx, businessId: string, id: string) {
  const [order] = await tx
    .select()
    .from(customerOrders)
    .where(and(eq(customerOrders.id, id), eq(customerOrders.businessId, businessId)))
    .for('update');
  if (!order) throw new Error('Order not found');
  return order;
}
export interface DeliveryBalance extends Record<string, unknown> {
  id: string;
  saleId: string;
  billNo: string;
  total: string;
  returned: string;
  applied: string;
  createdAt: Date;
}
export async function orderLedger(tx: OrderTx, order: Order) {
  const deliveries = Array.from(
    await tx.execute<DeliveryBalance>(sql`SELECT d.id,s.id AS "saleId",s.bill_no AS "billNo",s.total::text,
  COALESCE((SELECT sum(r.total) FROM sales_returns r WHERE r.business_id=d.business_id AND r.original_sale_id=s.id AND r.status='completed'),0)::text AS returned,
  COALESCE((SELECT sum(a.amount) FROM customer_order_allocations a WHERE a.business_id=d.business_id AND a.delivery_id=d.id),0)::text AS applied,d.created_at AS "createdAt"
  FROM customer_order_deliveries d JOIN sales s ON s.id=d.sale_id AND s.business_id=d.business_id
  WHERE d.business_id=${order.businessId}::uuid AND d.order_id=${order.id}::uuid ORDER BY d.created_at,d.id`),
  );
  const [paid] = await tx.execute<{ amount: string }>(
    sql`SELECT COALESCE(sum(CASE kind WHEN 'receipt' THEN amount ELSE -amount END),0)::text AS amount FROM customer_order_payments WHERE business_id=${order.businessId}::uuid AND order_id=${order.id}::uuid`,
  );
  const received = moneyCents(paid?.amount ?? '0');
  const returned = deliveries.reduce((n, d) => n + moneyCents(d.returned), 0);
  const invoiced = deliveries.reduce((n, d) => n + moneyCents(d.total) - moneyCents(d.returned), 0);
  const applied = deliveries.reduce((n, d) => n + moneyCents(d.applied), 0);
  if (
    received < 0 ||
    applied < 0 ||
    applied > received ||
    deliveries.some(
      (d) =>
        moneyCents(d.applied) < 0 ||
        moneyCents(d.applied) > moneyCents(d.total) - moneyCents(d.returned),
    )
  )
    throw new Error('Order ledger needs reconciliation');
  const target = order.status === 'cancelled' ? invoiced : moneyCents(order.total) - returned;
  if (target < invoiced || target < 0) throw new Error('Order value needs reconciliation');
  return {
    deliveries,
    received,
    returned,
    invoiced,
    applied,
    held: received - applied,
    due: invoiced - applied,
    target,
    balance: Math.max(0, target - received),
    refundDue: Math.max(0, received - target),
  };
}
export async function adjustOrderDebt(tx: OrderTx, order: Order, delta: number) {
  if (!delta) return;
  const amount = centsText(Math.abs(delta));
  const [changed] = await tx
    .update(customers)
    .set({
      outstandingBalance: sql`${customers.outstandingBalance}+${centsText(delta)}::numeric`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customers.businessId, order.businessId),
        eq(customers.id, order.customerId),
        delta < 0 ? gte(customers.outstandingBalance, amount) : undefined,
      ),
    )
    .returning({ id: customers.id });
  if (!changed) throw new Error('Customer debt needs reconciliation before adjusting this order');
}
export async function updateOrderBillStatus(
  tx: OrderTx,
  order: Order,
  delivery: DeliveryBalance,
  applied: number,
) {
  const net = moneyCents(delivery.total) - moneyCents(delivery.returned);
  const status = applied >= net ? 'paid' : applied > 0 ? 'partial' : 'due';
  await tx
    .update(sales)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(and(eq(sales.id, delivery.saleId), eq(sales.businessId, order.businessId)));
}
export async function applyOrderFunds(
  tx: OrderTx,
  order: Order,
  originKind: 'receipt' | 'delivery' | 'return_apply',
  originId: string,
) {
  const ledger = await orderLedger(tx, order);
  let held = ledger.held;
  let consumed = 0;
  for (const d of ledger.deliveries) {
    const applied = moneyCents(d.applied);
    const due = moneyCents(d.total) - moneyCents(d.returned) - applied;
    const amount = Math.min(held, due);
    if (amount > 0) {
      await tx.insert(customerOrderAllocations).values({
        businessId: order.businessId,
        orderId: order.id,
        deliveryId: d.id,
        originKind,
        originId,
        amount: centsText(amount),
      });
      held -= amount;
      consumed += amount;
    }
    await updateOrderBillStatus(tx, order, d, applied + amount);
  }
  await adjustOrderDebt(tx, order, -consumed);
}
// Call after the return document exists; the order lock is held before the bill lock.
export async function reconcileOrderReturn(
  tx: OrderTx,
  order: Order,
  saleId: string,
  returnId: string,
  amount: string,
) {
  const rows = Array.from(
    await tx.execute<DeliveryBalance>(sql`SELECT d.id,s.id AS "saleId",s.bill_no AS "billNo",s.total::text,
 COALESCE((SELECT sum(r.total) FROM sales_returns r WHERE r.original_sale_id=s.id AND r.business_id=d.business_id AND r.status='completed'),0)::text AS returned,
 COALESCE((SELECT sum(a.amount) FROM customer_order_allocations a WHERE a.delivery_id=d.id AND a.business_id=d.business_id),0)::text AS applied,d.created_at AS "createdAt"
 FROM customer_order_deliveries d JOIN sales s ON s.id=d.sale_id AND s.business_id=d.business_id WHERE d.business_id=${order.businessId}::uuid AND d.order_id=${order.id}::uuid AND s.id=${saleId}::uuid`),
  );
  const d = rows[0];
  if (!d) throw new Error('Order delivery not found');
  const applied = moneyCents(d.applied);
  const net = moneyCents(d.total) - moneyCents(d.returned);
  const released = Math.max(0, applied - net);
  if (net < 0 || released > moneyCents(amount))
    throw new Error('Order return needs reconciliation');
  if (released)
    await tx.insert(customerOrderAllocations).values({
      businessId: order.businessId,
      orderId: order.id,
      deliveryId: d.id,
      amount: centsText(-released),
      originKind: 'return',
      originId: returnId,
    });
  await adjustOrderDebt(tx, order, -(moneyCents(amount) - released));
  await updateOrderBillStatus(tx, order, d, applied - released);
  // Released money can settle other delivery bills of this same order.
  // Keep it held instead if no other bill is due; an explicit refund records outgoing money.
  await applyOrderFunds(tx, order, 'return_apply', returnId);
}
export async function unpaidOrderDebt(tx: OrderTx, businessId: string, customerId: string) {
  const [row] = await tx.execute<{ amount: string }>(sql`SELECT COALESCE(sum(s.total
 -COALESCE((SELECT sum(r.total) FROM sales_returns r WHERE r.original_sale_id=s.id AND r.business_id=s.business_id AND r.status='completed'),0)
 -COALESCE((SELECT sum(a.amount) FROM customer_order_allocations a WHERE a.delivery_id=d.id AND a.business_id=d.business_id),0)),0)::text AS amount
 FROM customer_order_deliveries d JOIN customer_orders o ON o.id=d.order_id AND o.business_id=d.business_id JOIN sales s ON s.id=d.sale_id AND s.business_id=d.business_id
 WHERE o.business_id=${businessId}::uuid AND o.customer_id=${customerId}::uuid`);
  return moneyCents(row?.amount ?? '0');
}
