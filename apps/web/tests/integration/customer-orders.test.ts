import { randomUUID } from 'node:crypto';
import {
  businesses,
  customerOrderAllocations,
  customerOrderDeliveries,
  customerOrderItems,
  customerOrderPayments,
  customerOrders,
  customers,
  departments,
  products,
  saleItems,
  sales,
  stores,
  user,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({
  id: '',
  businessId: '',
  role: 'owner',
  storeId: null as string | null,
}));
vi.mock('@/lib/db', async () => ({
  db: (await import('@mybizone/db')).createDb(
    'postgresql://postgres@127.0.0.1:55432/mybizone_release_test',
  ),
}));
vi.mock('@/lib/session', () => ({ requireUser: async () => ({ ...state }) }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { db } from '@/lib/db';
import { canReadOrder } from '@/lib/order-access';
import { orderLedger } from '@/lib/order-ledger';
import { loadOrderDetail, loadOrderList } from '@/lib/order-queries';
import { loadWorkspaceDashboard } from '@/lib/workspace-dashboard';
import { deleteCustomerAction } from '../../app/(app)/customers/actions';
import { enableBatchTrackingAction } from '../../app/(app)/inventory/batches/actions';
import { enableSerialTrackingAction } from '../../app/(app)/inventory/serials/actions';
import {
  cancelOrderAction,
  createOrderAction,
  deliverOrderAction,
  recordOrderPaymentAction,
  rescheduleOrderAction,
} from '../../app/(app)/orders/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import { createSalesSettlementAction } from '../../app/(app)/settlements/actions';
let storeId = '';
let productId = '';
let customerId = '';
const tenants: string[] = [];
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  expect(r.ok, r.ok ? '' : r.error).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
function orderInput(qty = '3', unitPrice = '100') {
  return {
    id: randomUUID(),
    storeId,
    customerId,
    deliveryAddress: '27 Garden Road, showroom entrance',
    promisedOn: '2026-11-20',
    billType: 'non_gst_bill',
    items: [{ productId, qty, unitPrice }],
  };
}
async function create(qty = '3', price = '100') {
  return ok(await createOrderAction(orderInput(qty, price))).id;
}
async function item(orderId: string) {
  const [row] = await db
    .select()
    .from(customerOrderItems)
    .where(eq(customerOrderItems.orderId, orderId));
  if (!row) throw new Error('Missing order item');
  return row;
}
async function pay(orderId: string, amount: string, kind = 'receipt') {
  return recordOrderPaymentAction({
    id: randomUUID(),
    orderId,
    kind,
    amount,
    method: 'cash',
    note: 'Actual money verified and recorded',
  });
}
async function deliver(orderId: string, qty = '1', serialNumbers?: string[]) {
  return deliverOrderAction({
    id: randomUUID(),
    orderId,
    note: 'Handover verified with customer',
    items: [{ itemId: (await item(orderId)).id, qty, serialNumbers }],
  });
}
async function balance() {
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  return c?.outstandingBalance;
}
async function stock() {
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  return p?.inventory;
}
async function ledger(orderId: string) {
  const [o] = await db.select().from(customerOrders).where(eq(customerOrders.id, orderId));
  if (!o) throw new Error('Missing order');
  return withTenant(db, state.businessId, (tx) => orderLedger(tx, o));
}
async function returned(saleId: string, qty = '1', serialNumbers?: string[]) {
  return createSalesReturnAction({
    originalSaleId: saleId,
    items: [{ productId, qty, serialNumbers }],
    reason: 'Customer returned inspected goods',
  });
}
async function role(value: string, store: string | null = null) {
  state.role = value;
  state.storeId = store;
  await db.update(user).set({ role: value, storeId: store }).where(eq(user.id, state.id));
}
describe.skipIf(process.env.DATABASE_URL !== url)(
  'order advances and physical deliveries on guarded PostgreSQL',
  () => {
    beforeAll(async () => {
      const [d] = await db.$client`SHOW data_directory`;
      if (!d?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
        throw new Error('Unexpected cluster');
    });
    beforeEach(async () => {
      const [biz] = await db
        .insert(businesses)
        .values({ name: 'Furniture order regression', plan: 'pro' })
        .returning();
      if (!biz) throw new Error('Fixture failed');
      state.businessId = biz.id;
      tenants.push(biz.id);
      state.id = randomUUID();
      state.role = 'owner';
      state.storeId = null;
      await db
        .insert(user)
        .values({ ...state, name: 'Order tester', email: `${state.id}@example.invalid` });
      const [st] = await db
        .insert(stores)
        .values({ businessId: biz.id, name: 'Furniture showroom' })
        .returning();
      if (!st) throw new Error('Fixture failed');
      storeId = st.id;
      const [p] = await db
        .insert(products)
        .values({
          businessId: biz.id,
          storeId,
          name: 'Oak sideboard',
          unitType: 'piece',
          unitSymbol: 'pc',
          price: '125',
          costPrice: '60',
          inventory: '5',
        })
        .returning();
      const [c] = await db
        .insert(customers)
        .values({ businessId: biz.id, name: 'Aruna Estate', outstandingBalance: '50' })
        .returning();
      if (!p || !c) throw new Error('Fixture failed');
      productId = p.id;
      customerId = c.id;
    });
    afterAll(async () => {
      for (const businessId of tenants) {
        await db.delete(sales).where(eq(sales.businessId, businessId));
        await db
          .update(products)
          .set({ departmentId: null })
          .where(eq(products.businessId, businessId));
        await db.delete(departments).where(eq(departments.businessId, businessId));
        await db.delete(businesses).where(eq(businesses.id, businessId));
      }
      await db.$client.end();
    });
    it('retains customer order history even when no customer debt remains', async () => {
      await db
        .update(customers)
        .set({ outstandingBalance: '0' })
        .where(eq(customers.id, customerId));
      const orderId = await create();
      ok(await pay(orderId, '100'));
      const result = await deleteCustomerAction({ id: customerId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('customer with order history');
      expect((await ledger(orderId)).held).toBe(10000);
    });

    it('records an agreement without stock, sales, debt or invented advance changes', async () => {
      const id = await create();
      expect(await stock()).toBe('5.000');
      expect(await balance()).toBe('50.00');
      expect(
        await db.select().from(sales).where(eq(sales.businessId, state.businessId)),
      ).toHaveLength(0);
      expect((await ledger(id)).target).toBe(30000);
    });
    it('applies advances and later receipts to exact partial delivery bills without touching unrelated debt', async () => {
      const id = await create();
      ok(await pay(id, '50'));
      expect(await balance()).toBe('50.00');
      expect((await ledger(id)).held).toBe(5000);
      const first = ok(await deliver(id));
      expect(await balance()).toBe('100.00');
      expect((await ledger(id)).due).toBe(5000);
      ok(await pay(id, '100'));
      expect(await balance()).toBe('50.00');
      expect((await ledger(id)).held).toBe(5000);
      ok(await deliver(id));
      expect(await balance()).toBe('100.00');
      ok(await pay(id, '50'));
      ok(await deliver(id));
      ok(await pay(id, '100'));
      const l = await ledger(id);
      expect([l.received, l.applied, l.held, l.due, l.balance]).toEqual([30000, 30000, 0, 0, 0]);
      expect(await stock()).toBe('2.000');
      expect(await balance()).toBe('50.00');
      const [bill] = await db.select().from(sales).where(eq(sales.id, first.saleId));
      expect(bill?.paymentStatus).toBe('paid');
    });
    it('preserves agreed prices across later product edits', async () => {
      const id = await create();
      await db.update(products).set({ price: '999' }).where(eq(products.id, productId));
      const d = ok(await deliver(id));
      const [line] = await db.select().from(saleItems).where(eq(saleItems.saleId, d.saleId));
      expect(line?.unitPrice).toBe('100.00');
      expect(line?.lineTotal).toBe('100.00');
    });
    it('does not duplicate orders, receipts or handovers on repeated request IDs', async () => {
      const input = orderInput();
      ok(await createOrderAction(input));
      ok(await createOrderAction(input));
      expect((await createOrderAction({ ...input, promisedOn: '2026-11-21' })).ok).toBe(false);
      const p = {
        id: randomUUID(),
        orderId: input.id,
        kind: 'receipt',
        amount: '100',
        method: 'cash',
        note: 'Receipt verified',
      };
      ok(await recordOrderPaymentAction(p));
      ok(await recordOrderPaymentAction(p));
      expect((await recordOrderPaymentAction({ ...p, amount: '99' })).ok).toBe(false);
      const d = {
        id: randomUUID(),
        orderId: input.id,
        note: 'Handover confirmed',
        items: [{ itemId: (await item(input.id)).id, qty: '1' }],
      };
      ok(await deliverOrderAction(d));
      ok(await deliverOrderAction(d));
      expect(await stock()).toBe('4.000');
      expect((await ledger(input.id)).received).toBe(10000);
      expect(
        await db
          .select()
          .from(customerOrderDeliveries)
          .where(eq(customerOrderDeliveries.orderId, input.id)),
      ).toHaveLength(1);
    });
    it('serializes competing payments and prevents excess money or invalid amounts', async () => {
      const id = await create();
      const rs = await Promise.all([pay(id, '200'), pay(id, '200')]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect((await ledger(id)).received).toBe(20000);
      expect((await pay(id, '0')).ok).toBe(false);
      expect((await pay(id, '1.001')).ok).toBe(false);
      expect((await pay(id, '201', 'refund')).ok).toBe(false);
    });
    it('serializes partial deliveries and rejects over-delivery without a partial bill', async () => {
      const id = await create();
      const rs = await Promise.all([deliver(id, '2'), deliver(id, '2')]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(await stock()).toBe('3.000');
      expect((await ledger(id)).deliveries).toHaveLength(1);
      expect((await deliver(id, '2')).ok).toBe(false);
      expect(await balance()).toBe('250.00');
    });
    it('rolls back bill, allocations and quantities when physical stock is insufficient', async () => {
      const id = await create('6');
      ok(await pay(id, '100'));
      expect((await deliver(id, '6')).ok).toBe(false);
      expect(await stock()).toBe('5.000');
      expect((await ledger(id)).deliveries).toHaveLength(0);
      expect((await ledger(id)).held).toBe(10000);
      expect((await item(id)).deliveredQty).toBe('0.000');
      expect(await balance()).toBe('50.00');
    });
    it('reserves order debt from generic settlements while allowing unrelated debt payments', async () => {
      const id = await create();
      ok(await deliver(id));
      expect(
        (await createSalesSettlementAction({ customerId, amount: '51', paymentMethod: 'cash' })).ok,
      ).toBe(false);
      ok(await createSalesSettlementAction({ customerId, amount: '50', paymentMethod: 'cash' }));
      expect(await balance()).toBe('100.00');
      ok(await pay(id, '100'));
      expect(await balance()).toBe('0.00');
    });
    it('reduces exact unpaid order debt on returns, without reopening quantities', async () => {
      const id = await create();
      const d = ok(await deliver(id, '2'));
      ok(await returned(d.saleId));
      expect(await balance()).toBe('150.00');
      const l = await ledger(id);
      expect([l.invoiced, l.due, l.target]).toEqual([10000, 10000, 20000]);
      expect((await item(id)).deliveredQty).toBe('2.000');
      expect(await stock()).toBe('4.000');
    });
    it('releases paid returned value as an advance and records its actual refund', async () => {
      const id = await create('1');
      ok(await pay(id, '100'));
      const d = ok(await deliver(id));
      ok(await returned(d.saleId));
      const l = await ledger(id);
      expect([l.target, l.invoiced, l.held, l.refundDue]).toEqual([0, 0, 10000, 10000]);
      expect(await balance()).toBe('50.00');
      ok(await pay(id, '100', 'refund'));
      expect((await ledger(id)).received).toBe(0);
      expect((await pay(id, '1', 'refund')).ok).toBe(false);
      expect((await returned(d.saleId)).ok).toBe(false);
    });
    it('reapplies returned paid value only to other unpaid bills of the same order', async () => {
      const id = await create();
      const first = ok(await deliver(id, '2'));
      ok(await returned(first.saleId));
      ok(await pay(id, '100'));
      ok(await deliver(id));
      expect(await balance()).toBe('150.00');
      ok(await returned(first.saleId));
      const l = await ledger(id);
      expect([l.due, l.held, l.target, l.applied]).toEqual([0, 0, 10000, 10000]);
      expect(await balance()).toBe('50.00');
    });
    it('requires unused advance refunds before cancellation and preserves delivery debt', async () => {
      const id = await create();
      ok(await pay(id, '150'));
      const d = ok(await deliver(id));
      expect((await cancelOrderAction({ orderId: id, note: 'Cancel remainder' })).ok).toBe(false);
      ok(await pay(id, '50', 'refund'));
      ok(await cancelOrderAction({ orderId: id, note: 'Remainder cancelled' }));
      expect((await ledger(id)).target).toBe(10000);
      expect((await deliver(id)).ok).toBe(false);
      expect(await stock()).toBe('4.000');
      ok(await returned(d.saleId));
      expect((await ledger(id)).held).toBe(10000);
      ok(await pay(id, '100', 'refund'));
      expect(await balance()).toBe('50.00');
      const second = await create();
      ok(await deliver(second));
      ok(await cancelOrderAction({ orderId: second, note: 'Cancel remaining goods' }));
      ok(await pay(second, '100'));
      expect(await balance()).toBe('50.00');
    });
    it('rounds partial GST bills cumulatively, preserving the agreement and tax snapshot', async () => {
      await db
        .update(businesses)
        .set({ gstEnabled: true, gstin: '29ABCDE1234F1Z5' })
        .where(eq(businesses.id, state.businessId));
      await db.update(products).set({ gstRate: '18' }).where(eq(products.id, productId));
      const input = { ...orderInput('3', '0.01'), billType: 'gst_bill' };
      ok(await createOrderAction(input));
      for (let n = 0; n < 3; n++) ok(await deliver(input.id));
      const l = await ledger(input.id);
      expect(l.invoiced).toBe(4);
      const bills = await db.select().from(sales).where(eq(sales.businessId, state.businessId));
      expect(bills.reduce((n, b) => n + Math.round(Number(b.taxTotal) * 100), 0)).toBe(1);
      expect(
        bills.every((b) => b.gstEnabledAtSale && b.businessGstinAtSale === '29ABCDE1234F1Z5'),
      ).toBe(true);
    });
    it('blocks changed tax identity, product units and cancelled edits', async () => {
      const id = await create();
      await db
        .update(products)
        .set({ unitType: 'weight', unitSymbol: 'kg' })
        .where(eq(products.id, productId));
      expect((await deliver(id)).ok).toBe(false);
      ok(
        await rescheduleOrderAction({
          orderId: id,
          promisedOn: '2026-12-01',
          deliveryAddress: 'New customer address',
          note: 'Requested revised handover',
        }),
      );
      expect(
        (
          await rescheduleOrderAction({
            orderId: id,
            promisedOn: '2026-02-30',
            deliveryAddress: 'Address',
            note: 'Invalid date test',
          })
        ).ok,
      ).toBe(false);
      ok(await cancelOrderAction({ orderId: id, note: 'Cancelled before delivery' }));
      expect(
        (
          await rescheduleOrderAction({
            orderId: id,
            promisedOn: '2026-12-01',
            deliveryAddress: 'Address',
            note: 'Already cancelled',
          })
        ).ok,
      ).toBe(false);
    });
    it('allocates exact serials and starts their warranties at handover, with return quarantine', async () => {
      ok(
        await enableSerialTrackingAction({
          productId,
          serialNumbers: ['A', 'B', 'C', 'D', 'E'],
          warrantyMonths: 12,
          warrantyIssuer: 'Furniture maker',
        }),
      );
      const id = await create('2');
      const d = ok(await deliver(id, '2', ['A', 'B']));
      expect(await stock()).toBe('3.000');
      ok(await returned(d.saleId, '1', ['A']));
      const [unit] = await db.execute<{ state: string }>(
        sql`SELECT state FROM stock_serials WHERE product_id=${productId}::uuid AND code='A'`,
      );
      expect(unit?.state).toBe('quarantine');
    });
    it('rejects unavailable batch stock without mutating the order', async () => {
      ok(
        await enableBatchTrackingAction({
          productId,
          batches: [{ code: 'OLD', qty: '5', expiresOn: '2020-01-01', quarantine: false }],
        }),
      );
      const id = await create('1');
      expect((await deliver(id)).ok).toBe(false);
      expect((await ledger(id)).deliveries).toHaveLength(0);
      expect(await stock()).toBe('5.000');
    });
    it('enforces customer/store ownership, role boundaries and finance collection access', async () => {
      const [other] = await db
        .insert(stores)
        .values({ businessId: state.businessId, name: 'Other showroom' })
        .returning();
      if (!other) throw new Error('Fixture failed');
      expect((await createOrderAction({ ...orderInput(), storeId: other.id })).ok).toBe(false);
      expect(canReadOrder([{ role: 'sales', storeId }], storeId)).toBe(true);
      expect(canReadOrder([{ role: 'sales', storeId: other.id }], storeId)).toBe(false);
      expect(
        canReadOrder([{ role: 'floor_manager', storeId, departmentId: randomUUID() }], storeId),
      ).toBe(false);
      const id = await create();
      await role('sales', storeId);
      expect((await createOrderAction(orderInput())).ok).toBe(false);
      expect((await pay(id, '1')).ok).toBe(false);
      await role('accounts');
      ok(await pay(id, '10'));
      expect((await deliver(id)).ok).toBe(false);
      await role('marketing');
      expect((await pay(id, '1')).ok).toBe(false);
    });
    it('loads list/detail totals with exact store permissions and native filters', async () => {
      const input = { ...orderInput(), promisedOn: '2026-01-01' };
      ok(await createOrderAction(input));
      ok(await pay(input.id, '25'));
      const roles = [{ role: 'super_admin' as const }];
      const list = await loadOrderList(db, state.businessId, roles, { q: 'Aruna', view: 'late' });
      expect(list.rows).toHaveLength(1);
      expect(list.rows[0]?.held).toBe(2500);
      expect(list.totals.late).toBe(1);
      const detail = await loadOrderDetail(db, state.businessId, roles, input.id);
      expect(detail?.items[0]?.inventory).toBe('5.000');
      expect(detail?.ledger.held).toBe(2500);
      const [other] = await db
        .insert(stores)
        .values({ businessId: state.businessId, name: 'Other view store' })
        .returning();
      if (!other) throw new Error('Fixture failed');
      await expect(
        loadOrderList(db, state.businessId, [{ role: 'sales', storeId: other.id }], { storeId }),
      ).rejects.toThrow('outside your access');
      await expect(
        loadOrderDetail(db, state.businessId, [{ role: 'sales', storeId: other.id }], input.id),
      ).rejects.toThrow('Permission denied');
      expect(
        (await loadOrderList(db, state.businessId, [{ role: 'accounts' }], {})).rows,
      ).toHaveLength(1);
    });
    it('shows scoped handover line counts without customer or money leakage to departments', async () => {
      const [department] = await db
        .insert(departments)
        .values({ businessId: state.businessId, storeId, name: 'Showroom floor' })
        .returning();
      if (!department) throw new Error('Fixture failed');
      await db
        .update(products)
        .set({ departmentId: department.id })
        .where(eq(products.id, productId));
      const id = await create();
      ok(await pay(id, '75'));
      const scoped = await loadWorkspaceDashboard(
        db,
        state.businessId,
        [{ role: 'inventory', storeId, departmentId: department.id }],
        { view: 'inventory' },
      );
      expect(scoped.orderInsights.attention).toHaveLength(1);
      expect(scoped.orderInsights.attention[0]?.units).toBe(1);
      expect(scoped.orderInsights.money).toBeNull();
      expect(JSON.stringify(scoped.orderInsights)).not.toContain('Aruna Estate');
      const [other] = await db
        .insert(departments)
        .values({ businessId: state.businessId, storeId, name: 'Other floor' })
        .returning();
      if (!other) throw new Error('Fixture failed');
      const hidden = await loadWorkspaceDashboard(
        db,
        state.businessId,
        [{ role: 'inventory', storeId, departmentId: other.id }],
        { view: 'inventory' },
      );
      expect(hidden.orderInsights.attention).toHaveLength(0);
      const owner = await loadWorkspaceDashboard(
        db,
        state.businessId,
        [{ role: 'super_admin' }],
        {},
      );
      expect(owner.orderInsights.money?.held).toBe('75.00');
      expect(owner.orderInsights.money?.received).toBe('75.00');
    });
    it('revalidates GST identity at delivery while retaining the original agreed rate', async () => {
      await db
        .update(businesses)
        .set({ gstEnabled: true, gstin: '29ABCDE1234F1Z5' })
        .where(eq(businesses.id, state.businessId));
      await db.update(products).set({ gstRate: '18' }).where(eq(products.id, productId));
      const input = { ...orderInput('1'), billType: 'gst_bill' };
      ok(await createOrderAction(input));
      await db
        .update(businesses)
        .set({ gstin: '27ABCDE1234F1Z7' })
        .where(eq(businesses.id, state.businessId));
      expect((await deliver(input.id)).ok).toBe(false);
      expect(await stock()).toBe('5.000');
      await db
        .update(businesses)
        .set({ gstin: '29ABCDE1234F1Z5' })
        .where(eq(businesses.id, state.businessId));
      await db.update(products).set({ gstRate: '5' }).where(eq(products.id, productId));
      const d = ok(await deliver(input.id));
      const [bill] = await db.select().from(sales).where(eq(sales.id, d.saleId));
      expect(bill?.taxTotal).toBe('18.00');
    });
    it('rejects malformed quantities gracefully and keeps last-unit handovers atomic across orders', async () => {
      expect((await createOrderAction(orderInput('junk'))).ok).toBe(false);
      const one = await create('1');
      expect((await deliver(one, '-1')).ok).toBe(false);
      expect((await deliver(one, '0.1')).ok).toBe(false);
      await db.update(products).set({ inventory: '1' }).where(eq(products.id, productId));
      const two = await create('1');
      const results = await Promise.all([deliver(one), deliver(two)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await stock()).toBe('0.000');
      expect(await balance()).toBe('150.00');
    });
    it('keeps duplicate concurrent commands idempotent and binds allocations to their order', async () => {
      const input = orderInput();
      const created = await Promise.all([createOrderAction(input), createOrderAction(input)]);
      expect(created.every((r) => r.ok)).toBe(true);
      const d = {
        id: randomUUID(),
        orderId: input.id,
        note: 'Same physical handover',
        items: [{ itemId: (await item(input.id)).id, qty: '1' }],
      };
      const results = await Promise.all([deliverOrderAction(d), deliverOrderAction(d)]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await stock()).toBe('4.000');
      const second = await create();
      await expect(
        db.insert(customerOrderAllocations).values({
          businessId: state.businessId,
          orderId: second,
          deliveryId: d.id,
          amount: '1',
          originKind: 'receipt',
          originId: randomUUID(),
        }),
      ).rejects.toThrow();
    });
    it('forces tenant isolation and preserves immutable payment and agreed-price records', async () => {
      const id = await create();
      ok(await pay(id, '10'));
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx
            .update(customerOrderPayments)
            .set({ amount: '1' })
            .where(eq(customerOrderPayments.orderId, id)),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx
            .update(customerOrderItems)
            .set({ unitPrice: '1' })
            .where(eq(customerOrderItems.orderId, id)),
        ),
      ).rejects.toThrow();
      const [foreign] = await db
        .insert(businesses)
        .values({ name: 'Foreign order test' })
        .returning();
      if (!foreign) throw new Error('Fixture failed');
      tenants.push(foreign.id);
      expect(
        await withTenant(db, foreign.id, (tx) => tx.select().from(customerOrders)),
      ).toHaveLength(0);
      await expect(
        db.insert(customerOrderAllocations).values({
          businessId: foreign.id,
          orderId: id,
          deliveryId: randomUUID(),
          amount: '1',
          originKind: 'receipt',
          originId: randomUUID(),
        }),
      ).rejects.toThrow();
    });
  },
);
