import { randomUUID } from 'node:crypto';
import {
  businesses,
  customerOrderItems,
  customerOrders,
  customers,
  productPacks,
  products,
  purchaseItems,
  saleItems,
  sales,
  stockSerials,
  stores,
  suppliers,
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
vi.mock('@/lib/storage', () => ({
  uploadFile: vi.fn(async () => ({ key: 'invoices/wholesale.pdf' })),
}));
vi.mock('@mybizone/pdf/invoice', () => ({
  renderInvoicePdf: vi.fn(async () => Buffer.from('test-pdf')),
}));
import { db } from '@/lib/db';
import { orderLedger } from '@/lib/order-ledger';
import { loadOrderDetail, loadOrderList } from '@/lib/order-queries';
import * as wholesaleServer from '@/lib/wholesale';
import { creditDueDate } from '@/lib/wholesale-policy';
import { renderInvoicePdf } from '@mybizone/pdf/invoice';
import { updateCustomerAction } from '../../app/(app)/customers/actions';
import { archivePackAction, createPackAction } from '../../app/(app)/inventory/packs/actions';
import { enableSerialTrackingAction } from '../../app/(app)/inventory/serials/actions';
import { generateInvoiceAction } from '../../app/(app)/invoices/actions';
import {
  createOrderAction,
  deliverOrderAction,
  recordOrderPaymentAction,
} from '../../app/(app)/orders/actions';
import { createPurchaseReturnAction } from '../../app/(app)/purchase-returns/actions';
import { createPurchaseAction } from '../../app/(app)/purchases/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import { createSaleAction } from '../../app/(app)/sales/actions';
let storeId = '';
let productId = '';
let customerId = '';
let supplierId = '';
const tenants: string[] = [];
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  expect(r.ok, r.ok ? '' : r.error).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
async function pack(factor = '12') {
  return ok(
    await createPackAction({ id: randomUUID(), productId, name: 'Carton', qtyPerPack: factor }),
  ).id;
}
async function sale(qty = '1', extra: Record<string, unknown> = {}, method = 'credit') {
  return createSaleAction({
    storeId,
    customerId,
    customerName: 'Wholesale customer',
    paymentMethod: method,
    billType: 'non_gst_bill',
    discount: '0',
    lines: [{ productId, qty, ...extra }],
  });
}
async function order(packId?: string) {
  return ok(
    await createOrderAction({
      id: randomUUID(),
      storeId,
      customerId,
      tradeType: 'wholesale',
      billType: 'non_gst_bill',
      promisedOn: '2026-12-01',
      deliveryAddress: 'Warehouse gate 3',
      items: [
        {
          productId,
          qty: '27',
          unitPrice: '8',
          packId,
          packCount: packId ? '2' : undefined,
          looseQty: packId ? '3' : undefined,
        },
      ],
    }),
  ).id;
}
async function handover(orderId: string, qty = '12') {
  const [item] = await db
    .select()
    .from(customerOrderItems)
    .where(eq(customerOrderItems.orderId, orderId));
  if (!item) throw new Error('Missing item');
  return deliverOrderAction({
    id: randomUUID(),
    orderId,
    note: 'Warehouse handover confirmed',
    items: [{ itemId: item.id, qty }],
  });
}
async function pay(orderId: string, amount: string) {
  return recordOrderPaymentAction({
    id: randomUUID(),
    orderId,
    kind: 'receipt',
    method: 'cash',
    amount,
    note: 'Actual advance received',
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
describe.skipIf(process.env.DATABASE_URL !== url)('wholesale on guarded PostgreSQL', () => {
  beforeAll(async () => {
    const [d] = await db.$client`SHOW data_directory`;
    if (!d?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
      throw new Error('Unexpected cluster');
  });
  beforeEach(async () => {
    const [biz] = await db
      .insert(businesses)
      .values({ name: 'Wholesale regression', plan: 'pro' })
      .returning();
    if (!biz) throw new Error('Fixture failed');
    tenants.push(biz.id);
    state.businessId = biz.id;
    state.id = randomUUID();
    state.role = 'owner';
    state.storeId = null;
    await db
      .insert(user)
      .values({ ...state, name: 'Wholesale tester', email: `${state.id}@example.invalid` });
    const [store] = await db
      .insert(stores)
      .values({ businessId: biz.id, name: 'Wholesale store' })
      .returning();
    if (!store) throw new Error('Fixture failed');
    storeId = store.id;
    const [p] = await db
      .insert(products)
      .values({
        businessId: biz.id,
        storeId,
        name: 'Wholesale cups',
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '10',
        wholesalePrice: '8',
        rate1: '7',
        costPrice: '4',
        inventory: '100',
      })
      .returning();
    const [c] = await db
      .insert(customers)
      .values({
        businessId: biz.id,
        name: 'Wholesale customer',
        rateCategory: 'wholesale',
        creditDays: 30,
        creditLimit: '500',
        outstandingBalance: '50',
      })
      .returning();
    const [s] = await db
      .insert(suppliers)
      .values({ businessId: biz.id, name: 'Wholesale supplier' })
      .returning();
    if (!p || !c || !s) throw new Error('Fixture failed');
    productId = p.id;
    customerId = c.id;
    supplierId = s.id;
  });
  afterAll(async () => {
    for (const businessId of tenants) {
      await db.delete(sales).where(eq(sales.businessId, businessId));
      await db.delete(businesses).where(eq(businesses.id, businessId));
    }
    await db.$client.end();
  });
  it('defines immutable conversions without changing stock and makes retries safe', async () => {
    const input = { id: randomUUID(), productId, name: 'Carton', qtyPerPack: '12' };
    const a = ok(await createPackAction(input));
    expect(ok(await createPackAction(input)).id).toBe(a.id);
    expect(await stock()).toBe('100.000');
    const duplicate = await createPackAction({ ...input, id: randomUUID() });
    expect(duplicate.ok).toBe(false);
    await expect(
      withTenant(db, state.businessId, (tx) =>
        tx.execute(sql`UPDATE product_packs SET qty_per_pack=24 WHERE id=${a.id}::uuid`),
      ),
    ).rejects.toThrow();
  });
  it('receives packs and loose stock, keeping supplier returns in base units', async () => {
    const id = await pack();
    const receipt = ok(
      await createPurchaseAction({
        supplierId,
        supplierName: 'Wholesale supplier',
        paymentMethod: 'credit',
        items: [{ productId, qty: '1', unitPrice: '4', packId: id, packCount: '2', looseQty: '3' }],
      }),
    );
    expect(await stock()).toBe('127.000');
    const [line] = await db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, receipt.id));
    expect(line).toMatchObject({
      qty: '27.000',
      unitPrice: '4.00',
      lineTotal: '108.00',
      packSnapshot: { packs: '2', loose: '3.000' },
    });
    ok(
      await createPurchaseReturnAction({
        originalPurchaseId: receipt.id,
        items: [{ productId, qty: '3' }],
        reason: 'Loose units rejected',
      }),
    );
    expect(await stock()).toBe('124.000');
  });
  it('bills base quantities at server-selected wholesale prices instead of forged quantities or prices', async () => {
    const id = await pack();
    const bill = ok(
      await sale('1', { packId: id, packCount: '2', looseQty: '3', expectedUnitPrice: '8' }),
    );
    expect(bill.total).toBe('216.00');
    expect(await stock()).toBe('73.000');
    expect(await balance()).toBe('266.00');
    const [line] = await db.select().from(saleItems).where(eq(saleItems.saleId, bill.id));
    expect(line).toMatchObject({
      qty: '27.000',
      unitPrice: '8.00',
      packSnapshot: { factor: '12.000', packs: '2' },
    });
    const [billRow] = await db.select().from(sales).where(eq(sales.id, bill.id));
    expect(billRow?.dueDate).toBe(creditDueDate(30));
    expect((await sale('1', { expectedUnitPrice: '1' })).ok).toBe(false);
    expect(await stock()).toBe('73.000');
  });
  it('uses customer tiers for paid sales and keeps unrelated debt on paid returns', async () => {
    const bill = ok(await sale('2', {}, 'cash'));
    expect(bill.total).toBe('16.00');
    expect(await balance()).toBe('50.00');
    ok(
      await createSalesReturnAction({
        originalSaleId: bill.id,
        items: [{ productId, qty: '1' }],
        reason: 'Inspected loose return',
      }),
    );
    expect(await balance()).toBe('50.00');
    expect(await stock()).toBe('99.000');
  });
  it('freezes order conversions and credit terms across pack archive and customer edits', async () => {
    const packId = await pack();
    const id = await order(packId);
    expect(await stock()).toBe('100.000');
    expect(await balance()).toBe('50.00');
    ok(await archivePackAction({ id: packId }));
    await db.update(customers).set({ creditDays: 5 }).where(eq(customers.id, customerId));
    const bill = ok(await handover(id, '15'));
    const [row] = await db.select().from(sales).where(eq(sales.id, bill.saleId));
    expect(row?.dueDate).toBe(creditDueDate(30));
    const [line] = await db.select().from(saleItems).where(eq(saleItems.saleId, bill.saleId));
    expect(line?.packSnapshot).toMatchObject({ factor: '12.000', packs: '1', loose: '3.000' });
    expect((await sale('1', { packId, packCount: '1', looseQty: '0' })).ok).toBe(false);
  });
  it('checks net delivery debt after applying advances and rolls back over-limit handovers', async () => {
    await db.update(customers).set({ creditLimit: '100' }).where(eq(customers.id, customerId));
    const id = await order();
    ok(await pay(id, '60'));
    ok(await handover(id));
    expect(await balance()).toBe('86.00');
    expect(await stock()).toBe('88.000');
    const result = await handover(id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('credit limit');
    expect(await stock()).toBe('88.000');
    expect(await balance()).toBe('86.00');
    const [row] = await db.select().from(customerOrders).where(eq(customerOrders.id, id));
    if (!row) throw new Error('Missing order');
    const ledger = await withTenant(db, state.businessId, (tx) => orderLedger(tx, row));
    expect(ledger.invoiced).toBe(9600);
    expect(ledger.applied).toBe(6000);
  });
  it('serializes competing unpaid sales and never leaves stock or debt from the rejected sale', async () => {
    await db.update(customers).set({ creditLimit: '100' }).where(eq(customers.id, customerId));
    const results = await Promise.all([sale('5'), sale('5')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance()).toBe('90.00');
    expect(await stock()).toBe('95.000');
  });
  it('serializes competing order deliveries against shared customer credit', async () => {
    await db.update(customers).set({ creditLimit: '150' }).where(eq(customers.id, customerId));
    const a = await order();
    const b = await order();
    const results = await Promise.all([handover(a), handover(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance()).toBe('146.00');
    expect(await stock()).toBe('88.000');
  });
  it('allows cash sales and fully advanced handovers while already over the configured ceiling', async () => {
    await db.update(customers).set({ creditLimit: '10' }).where(eq(customers.id, customerId));
    ok(await sale('1', {}, 'cash'));
    const id = await order();
    ok(await pay(id, '96'));
    ok(await handover(id));
    expect(await balance()).toBe('50.00');
  });
  it('filters wholesale commitments and retains store permissions', async () => {
    const id = await order(await pack());
    const rows = await loadOrderList(db, state.businessId, [{ role: 'super_admin' }], {
      trade: 'wholesale',
    });
    expect(rows.rows.map((r) => r.id)).toEqual([id]);
    expect(
      (await loadOrderList(db, state.businessId, [{ role: 'super_admin' }], { trade: 'standard' }))
        .rows,
    ).toHaveLength(0);
    expect(
      (await loadOrderDetail(db, state.businessId, [{ role: 'super_admin' }], id))?.items[0]
        ?.packSnapshot?.factor,
    ).toBe('12.000');
    await expect(
      loadOrderList(db, state.businessId, [{ role: 'inventory', storeId }], { trade: 'wholesale' }),
    ).rejects.toThrow('Permission denied');
  });
  it('rejects stale unit conversions and another store role at mutation boundaries', async () => {
    const id = await pack();
    await db
      .update(products)
      .set({ unitType: 'weight', unitSymbol: 'kg' })
      .where(eq(products.id, productId));
    expect((await sale('1', { packId: id, packCount: '1' })).ok).toBe(false);
    state.role = 'inventory';
    const [otherStore] = await db
      .insert(stores)
      .values({ businessId: state.businessId, name: 'Other store' })
      .returning();
    if (!otherStore) throw new Error('Fixture failed');
    state.storeId = otherStore.id;
    await db
      .update(user)
      .set({ role: state.role, storeId: state.storeId })
      .where(eq(user.id, state.id));
    expect(
      (await createPackAction({ id: randomUUID(), productId, name: 'Case', qtyPerPack: '24' })).ok,
    ).toBe(false);
  });
  it('forces pack tenant isolation and rejects inconsistent snapshot quantities', async () => {
    const id = await pack();
    const [other] = await db
      .insert(businesses)
      .values({ name: 'Other pack tenant', plan: 'pro' })
      .returning();
    if (!other) throw new Error('Fixture failed');
    tenants.push(other.id);
    expect(
      await withTenant(db, other.id, (tx) =>
        tx.select().from(productPacks).where(eq(productPacks.id, id)),
      ),
    ).toEqual([]);
    const bill = ok(await sale('1', { packId: id, packCount: '1' }));
    await expect(
      db
        .update(saleItems)
        .set({
          packSnapshot: {
            name: 'Forged',
            factor: '12',
            packs: '2',
            loose: '0',
            unit: 'pc',
            unitType: 'piece',
          },
        })
        .where(eq(saleItems.saleId, bill.id)),
    ).rejects.toThrow();
  });
  it('retains credit days when older customer callers omit them and audits explicit changes', async () => {
    ok(
      await updateCustomerAction({
        id: customerId,
        name: 'Wholesale customer',
        phone: '',
        email: '',
        gstin: '',
        address: '',
        rateCategory: 'wholesale',
        creditLimit: '500',
      }),
    );
    const [first] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(first?.creditDays).toBe(30);
    ok(
      await updateCustomerAction({
        id: customerId,
        name: 'Wholesale customer',
        phone: '',
        email: '',
        gstin: '',
        address: '',
        rateCategory: 'wholesale',
        creditLimit: '500',
        creditDays: 14,
      }),
    );
    const [second] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(second?.creditDays).toBe(14);
  });
  it('requires finance authority for credit changes while preserving contact-only edits', async () => {
    state.role = 'sales';
    await db.update(user).set({ role: 'sales' }).where(eq(user.id, state.id));
    const payload = {
      id: customerId,
      name: 'Updated contact',
      phone: '',
      email: '',
      gstin: '',
      address: '',
      rateCategory: 'wholesale',
    };
    expect((await updateCustomerAction({ ...payload, creditLimit: '0', creditDays: 0 })).ok).toBe(
      false,
    );
    ok(await updateCustomerAction(payload));
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(customer).toMatchObject({
      name: 'Updated contact',
      creditLimit: '500.00',
      creditDays: 30,
    });
  });
  it('calculates GST from converted stock quantities and the actual customer tier', async () => {
    const id = await pack();
    await db
      .update(businesses)
      .set({ gstEnabled: true, gstin: '27AAPFU0939F1ZV' })
      .where(eq(businesses.id, state.businessId));
    await db.update(products).set({ gstRate: '18' }).where(eq(products.id, productId));
    const bill = ok(
      await createSaleAction({
        storeId,
        customerId,
        paymentMethod: 'cash',
        billType: 'gst_bill',
        discount: '0',
        lines: [{ productId, qty: '1', packId: id, packCount: '1', expectedUnitPrice: '8' }],
      }),
    );
    const [row] = await db.select().from(sales).where(eq(sales.id, bill.id));
    expect(row).toMatchObject({
      subtotal: '96.00',
      taxTotal: '17.28',
      total: '113.28',
      cgst: '8.64',
      sgst: '8.64',
    });
    expect(await stock()).toBe('88.000');
  });
  it('receives fractional measured packs exactly while charging per base unit', async () => {
    await db
      .update(products)
      .set({ unitType: 'weight', unitSymbol: 'kg', inventory: '0' })
      .where(eq(products.id, productId));
    const id = await pack('0.125');
    const bill = ok(
      await createPurchaseAction({
        supplierId,
        supplierName: 'Measured supplier',
        paymentMethod: 'cash',
        items: [
          { productId, qty: '1', unitPrice: '100', packId: id, packCount: '3', looseQty: '0.001' },
        ],
      }),
    );
    const [line] = await db
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, bill.id));
    expect(line).toMatchObject({
      qty: '0.376',
      lineTotal: '37.60',
      packSnapshot: { factor: '0.125', unit: 'kg' },
    });
    expect(await stock()).toBe('0.376');
  });
  it('requires serial identities for every converted piece and keeps warranty allocation exact', async () => {
    await db.update(products).set({ inventory: '4' }).where(eq(products.id, productId));
    const id = await pack('2');
    ok(
      await enableSerialTrackingAction({
        productId,
        serialNumbers: ['PACK-A', 'PACK-B', 'PACK-C', 'PACK-D'],
        warrantyMonths: 12,
        warrantyIssuer: 'Recorded issuer',
      }),
    );
    expect((await sale('1', { packId: id, packCount: '1', serialNumbers: ['PACK-A'] })).ok).toBe(
      false,
    );
    expect(await stock()).toBe('4.000');
    ok(await sale('1', { packId: id, packCount: '1', serialNumbers: ['PACK-A', 'PACK-B'] }));
    expect(await stock()).toBe('2.000');
    const units = await db.select().from(stockSerials).where(eq(stockSerials.productId, productId));
    expect(units.filter((u) => u.state === 'sold')).toHaveLength(2);
  });
  it.each(['sale', 'purchase'] as const)(
    'rejects a unit change racing with pack %s before stock is written',
    async (kind) => {
      const id = await pack();
      const original = wholesaleServer.resolvePack;
      const spy = vi
        .spyOn(wholesaleServer, 'resolvePack')
        .mockImplementationOnce(async (...args) => {
          const result = await original(...args);
          await db
            .update(products)
            .set({ unitType: 'weight', unitSymbol: 'kg' })
            .where(eq(products.id, productId));
          return result;
        });
      try {
        const result =
          kind === 'sale'
            ? await sale('1', { packId: id, packCount: '1' })
            : await createPurchaseAction({
                supplierId,
                supplierName: 'Supplier',
                paymentMethod: 'cash',
                items: [{ productId, qty: '1', unitPrice: '4', packId: id, packCount: '1' }],
              });
        expect(result.ok).toBe(false);
        expect(await stock()).toBe('100.000');
        expect(await balance()).toBe('50.00');
      } finally {
        spy.mockRestore();
      }
    },
  );
  it('blocks customer and supplier returns when their recorded base unit no longer matches stock', async () => {
    const id = await pack();
    const bill = ok(await sale('1', { packId: id, packCount: '1' }, 'cash'));
    await db
      .update(products)
      .set({ unitType: 'weight', unitSymbol: 'kg' })
      .where(eq(products.id, productId));
    expect(
      (
        await createSalesReturnAction({
          originalSaleId: bill.id,
          items: [{ productId, qty: '1' }],
          reason: 'Original base units',
        })
      ).ok,
    ).toBe(false);
    expect(await stock()).toBe('88.000');
    await db
      .update(products)
      .set({ unitType: 'piece', unitSymbol: 'pc' })
      .where(eq(products.id, productId));
    const receipt = ok(
      await createPurchaseAction({
        supplierId,
        supplierName: 'Supplier',
        paymentMethod: 'credit',
        items: [{ productId, qty: '1', unitPrice: '4', packId: id, packCount: '1' }],
      }),
    );
    await db
      .update(products)
      .set({ unitType: 'weight', unitSymbol: 'kg' })
      .where(eq(products.id, productId));
    expect(
      (
        await createPurchaseReturnAction({
          originalPurchaseId: receipt.id,
          items: [{ productId, qty: '1' }],
          reason: 'Original base units',
        })
      ).ok,
    ).toBe(false);
    expect(await stock()).toBe('100.000');
  });
  it('keeps pack conversion notes and exact base rates in issued PDFs', async () => {
    const id = await pack();
    const bill = ok(await sale('1', { packId: id, packCount: '1' }, 'cash'));
    ok(await generateInvoiceAction({ saleId: bill.id }));
    expect(vi.mocked(renderInvoicePdf).mock.lastCall?.[0].lines[0]).toMatchObject({
      qty: '12.000',
      unitSymbol: 'pc',
      unitPrice: '8.00',
      packDescription: expect.stringContaining('Carton'),
    });
  });
});
