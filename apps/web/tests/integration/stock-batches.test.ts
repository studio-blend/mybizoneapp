import { randomUUID } from 'node:crypto';
import {
  auditLogs,
  businesses,
  departments,
  products,
  sales,
  stockBatchMovements,
  stockBatches,
  stores,
  user,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq, sql } from 'drizzle-orm';
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
import { db } from '@/lib/db';
import { indiaToday, stockText, stockUnits } from '@/lib/stock-batch-policy';
import { sellableStockSql } from '@/lib/stock-batches';
import { loadWorkspaceDashboard } from '@/lib/workspace-dashboard';
import { createDamageLogAction } from '../../app/(app)/damage-logs/actions';
import {
  enableBatchTrackingAction,
  reviewBatchAction,
} from '../../app/(app)/inventory/batches/actions';
import { deleteProductAction, updateProductAction } from '../../app/(app)/products/actions';
import { createPurchaseReturnAction } from '../../app/(app)/purchase-returns/actions';
import { createPurchaseAction } from '../../app/(app)/purchases/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import { createSaleAction } from '../../app/(app)/sales/actions';

const tenants: string[] = [];
let storeId = '';
let productId = '';
const future = (days: number) =>
  new Date(Date.parse(`${indiaToday()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const opening = (code: string, qty: string, days: number, quarantine = false) => ({
  code,
  qty,
  expiresOn: future(days),
  quarantine,
});
const sale = (qty: string, billType = 'non_gst_bill', isFreeItem = false) =>
  createSaleAction({
    storeId,
    paymentMethod: 'cash',
    discount: '0',
    billType,
    lines: [{ productId, qty, isFreeItem }],
  });
const purchase = (qty: string, batchCode = 'NEW', expiresOn = future(10)) =>
  createPurchaseAction({
    supplierId: '',
    supplierName: 'Batch supplier',
    paymentMethod: 'cash',
    items: [{ productId, qty, unitPrice: '5', batchCode, expiresOn }],
  });
async function lots() {
  return db.select().from(stockBatches).where(eq(stockBatches.productId, productId));
}
async function invariant() {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  const batches = await lots();
  expect(batches.reduce((sum, batch) => sum + stockUnits(batch.quantity), 0)).toBe(
    stockUnits(product!.inventory),
  );
  for (const batch of batches) {
    const moves = await db
      .select()
      .from(stockBatchMovements)
      .where(eq(stockBatchMovements.batchId, batch.id));
    const total = moves.reduce(
      (sum, move) =>
        sum +
        (move.quantity.startsWith('-')
          ? -stockUnits(move.quantity.slice(1))
          : stockUnits(move.quantity)),
      0,
    );
    expect(stockText(total)).toBe(batch.quantity);
  }
}
async function enable(batches = [opening('EARLY', '1.500', 2), opening('LATE', '1.500', 20)]) {
  const result = await enableBatchTrackingAction({ productId, batches });
  expect(result.ok).toBe(true);
  return result;
}
async function setRole(role: string, scope: string | null = null) {
  state.role = role;
  state.storeId = scope;
  await db.update(user).set({ role, storeId: scope }).where(eq(user.id, state.id));
}
function success<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  expect(result.ok, result.ok ? '' : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe.skipIf(process.env.DATABASE_URL !== url)('batch workflows on isolated PostgreSQL', () => {
  beforeAll(async () => {
    const [directory] = await db.$client`SHOW data_directory`;
    if (!directory?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
      throw new Error('Unexpected cluster');
  });
  beforeEach(async () => {
    const [business] = await db
      .insert(businesses)
      .values({ name: 'Batch test', plan: 'pro' })
      .returning();
    state.businessId = business!.id;
    state.id = randomUUID();
    state.role = 'owner';
    state.storeId = null;
    tenants.push(state.businessId);
    await db.insert(user).values({
      id: state.id,
      name: 'Batch owner',
      email: `${state.id}@example.invalid`,
      businessId: state.businessId,
      role: 'owner',
    });
    const [store] = await db
      .insert(stores)
      .values({ businessId: state.businessId, name: 'Grocery' })
      .returning();
    storeId = store!.id;
    const [product] = await db
      .insert(products)
      .values({
        businessId: state.businessId,
        storeId,
        name: 'Batch rice',
        unitType: 'weight',
        unitSymbol: 'kg',
        price: '10',
        costPrice: '5',
        inventory: '3',
      })
      .returning();
    productId = product!.id;
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

  it('requires exact opening reconciliation and keeps aggregate stock unchanged', async () => {
    expect(
      (await enableBatchTrackingAction({ productId, batches: [opening('BAD', '2.999', 10)] })).ok,
    ).toBe(false);
    expect(await lots()).toHaveLength(0);
    await enable();
    await invariant();
    expect((await db.select().from(products).where(eq(products.id, productId)))[0]?.inventory).toBe(
      '3.000',
    );
    expect((await enableBatchTrackingAction({ productId, batches: [] })).ok).toBe(false);
  });
  it('accepts unknown expiry only in quarantine and rejects invalid dates and duplicate codes', async () => {
    for (const batches of [
      [{ code: 'A', qty: '3' }],
      [{ code: 'A', qty: '3', expiresOn: '2026-02-30' }],
      [opening('A', '1', 1), opening('A', '2', 2)],
    ]) {
      expect((await enableBatchTrackingAction({ productId, batches })).ok).toBe(false);
      expect(await lots()).toHaveLength(0);
    }
    success(
      await enableBatchTrackingAction({
        productId,
        batches: [{ code: 'UNKNOWN', qty: '3', quarantine: true }],
      }),
    );
    expect((await lots())[0]?.expiresOn).toBe(null);
    await invariant();
  });
  it('allocates fractional and free quantities by earliest expiry, preserving bill totals', async () => {
    await enable();
    const receipt = success(await sale('2', 'non_gst_bill', true));
    expect(receipt.total).toBe('0.00');
    const batches = await lots();
    expect(batches.find((b) => b.code === 'EARLY')?.quantity).toBe('0.000');
    expect(batches.find((b) => b.code === 'LATE')?.quantity).toBe('1.000');
    await invariant();
  });
  it('blocks expiry-day, expired and quarantined lots and rolls the entire sale back', async () => {
    await enable([
      opening('TODAY', '1', 0),
      opening('EXPIRED', '1', -1),
      opening('HOLD', '1', 5, true),
    ]);
    const result = await sale('1');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('sellable batch stock');
    expect(
      await db.select().from(sales).where(eq(sales.businessId, state.businessId)),
    ).toHaveLength(0);
    await invariant();
    const [available] = await withTenant(db, state.businessId, (tx) =>
      tx.select({ stock: sellableStockSql }).from(products).where(eq(products.id, productId)),
    );
    expect(Number(available?.stock)).toBe(0);
  });
  it('does not allocate batches or reduce stock for estimates', async () => {
    await enable();
    success(await sale('2', 'estimate'));
    await invariant();
    expect(
      await db
        .select()
        .from(stockBatchMovements)
        .where(
          and(
            eq(stockBatchMovements.businessId, state.businessId),
            eq(stockBatchMovements.kind, 'sale'),
          ),
        ),
    ).toHaveLength(0);
  });
  it('requires receipt metadata, merges matching lots and rejects conflicting expiry atomically', async () => {
    await enable();
    expect((await purchase('1', '', '')).ok).toBe(false);
    success(await purchase('0.250'));
    success(await purchase('0.750'));
    expect((await purchase('1', 'NEW', future(11))).ok).toBe(false);
    expect((await lots()).find((b) => b.code === 'NEW')?.quantity).toBe('1.000');
    await invariant();
  });
  it('quarantines customer returns, including returns from bills predating tracking', async () => {
    const sold = success(await sale('1')); // historical aggregate sale
    await enable([opening('OPENING', '2', 10)]);
    success(
      await createSalesReturnAction({
        originalSaleId: sold.id,
        items: [{ productId, qty: '0.500' }],
      }),
    );
    const held = (await lots()).find((b) => b.state === 'quarantine');
    expect(held?.quantity).toBe('0.500');
    expect(held?.expiresOn).toBe(null);
    const [available] = await withTenant(db, state.businessId, (tx) =>
      tx.select({ stock: sellableStockSql }).from(products).where(eq(products.id, productId)),
    );
    expect(Number(available?.stock)).toBe(2);
    await invariant();
  });
  it('requires a physical batch for damage, supports expired write-offs and rejects wrong lots', async () => {
    await enable([opening('OLD', '1', -1), opening('GOOD', '2', 5)]);
    expect((await createDamageLogAction({ productId, qty: '1', reason: 'expired' })).ok).toBe(
      false,
    );
    expect(
      (
        await createDamageLogAction({
          productId,
          qty: '1',
          reason: 'expired',
          batchId: randomUUID(),
        })
      ).ok,
    ).toBe(false);
    const batch = (await lots()).find((b) => b.code === 'OLD')!;
    success(
      await createDamageLogAction({ productId, qty: '1', reason: 'expired', batchId: batch.id }),
    );
    await invariant();
    expect((await lots()).find((b) => b.id === batch.id)?.quantity).toBe('0.000');
  });
  it('limits supplier returns to a batch on the original tracked receipt', async () => {
    await enable();
    const receipt = success(await purchase('1', 'SUPPLIER-LOT'));
    const batches = await lots();
    const old = batches.find((b) => b.code === 'EARLY')!;
    const received = batches.find((b) => b.code === 'SUPPLIER-LOT')!;
    expect(
      (
        await createPurchaseReturnAction({
          originalPurchaseId: receipt.id,
          items: [{ productId, qty: '0.500', batchId: old.id }],
        })
      ).ok,
    ).toBe(false);
    success(
      await createPurchaseReturnAction({
        originalPurchaseId: receipt.id,
        items: [{ productId, qty: '0.500', batchId: received.id }],
      }),
    );
    await invariant();
  });
  it('allows explicit physical lots when returning historical purchases', async () => {
    const receipt = success(await purchase('1'));
    await enable([opening('COUNTED', '4', 10)]);
    const batch = (await lots())[0]!;
    success(
      await createPurchaseReturnAction({
        originalPurchaseId: receipt.id,
        items: [{ productId, qty: '1', batchId: batch.id }],
      }),
    );
    await invariant();
  });
  it('requires a verified future expiry and inspection note to release returned stock', async () => {
    await enable();
    const sold = success(await sale('1'));
    success(
      await createSalesReturnAction({ originalSaleId: sold.id, items: [{ productId, qty: '1' }] }),
    );
    const batch = (await lots()).find((b) => b.state === 'quarantine')!;
    expect(
      (
        await reviewBatchAction({
          batchId: batch.id,
          decision: 'release',
          note: 'Verified',
          code: 'INSPECTED',
          expiresOn: indiaToday(),
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await reviewBatchAction({
          batchId: batch.id,
          decision: 'release',
          note: '',
          code: 'INSPECTED',
          expiresOn: future(5),
        })
      ).ok,
    ).toBe(false);
    success(
      await reviewBatchAction({
        batchId: batch.id,
        decision: 'release',
        note: 'Packaging and printed date checked',
        code: 'INSPECTED',
        expiresOn: future(5),
      }),
    );
    success(
      await reviewBatchAction({ batchId: batch.id, decision: 'hold', note: 'Supplier recall' }),
    );
    expect(
      (
        await reviewBatchAction({
          batchId: batch.id,
          decision: 'release',
          note: 'Recheck',
          code: 'CHANGE',
          expiresOn: future(50),
        })
      ).ok,
    ).toBe(false);
    await invariant();
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.businessId, state.businessId), eq(auditLogs.action, 'batch.release')),
        ),
    ).toHaveLength(1);
  });
  it('serializes concurrent sales so only one can take the final sellable quantity', async () => {
    await enable();
    const results = await Promise.all([sale('2'), sale('2')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await invariant();
  });
  it('serializes sale and exact-lot damage against the same stock', async () => {
    await enable([opening('ONE', '3', 10)]);
    const batch = (await lots())[0]!;
    const results = await Promise.all([
      sale('2'),
      createDamageLogAction({ productId, qty: '2', reason: 'damaged', batchId: batch.id }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    await invariant();
  });
  it('prevents a direct product edit from bypassing batch stock or changing units', async () => {
    await enable();
    expect((await deleteProductAction({ id: productId })).ok).toBe(false);
    const input = {
      id: productId,
      name: 'Batch rice',
      storeId,
      categoryId: '',
      brandId: '',
      unitType: 'weight',
      unitSymbol: 'kg',
      price: '10',
      costPrice: '5',
      mrp: '',
      wholesalePrice: '',
      rate1: '',
      rate2: '',
      rate3: '',
      rate4: '',
      minStock: '',
      inventory: '4',
      gstRate: '',
    };
    expect((await updateProductAction(input)).ok).toBe(false);
    expect(
      (await updateProductAction({ ...input, inventory: '3', unitType: 'piece', unitSymbol: 'pc' }))
        .ok,
    ).toBe(false);
    success(await updateProductAction({ ...input, inventory: '3', name: 'Renamed rice' }));
    await invariant();
  });
  it('detects stock drift and rolls back the attempted document', async () => {
    await enable();
    await db.update(products).set({ inventory: '4' }).where(eq(products.id, productId));
    expect((await sale('1')).ok).toBe(false);
    expect(
      await db.select().from(sales).where(eq(sales.businessId, state.businessId)),
    ).toHaveLength(0);
  });
  it('rechecks tracking when a receipt races activation', async () => {
    const results = await Promise.all([
      enableBatchTrackingAction({ productId, batches: [opening('OPEN', '3', 5)] }),
      purchase('1', 'RACING-RECEIPT'),
    ]);
    expect(results[1]?.ok).toBe(true);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product?.inventory).toBe('4.000');
    if (product?.batchTracking) await invariant();
    else expect(await lots()).toHaveLength(0);
  });
  it('enforces inventory role and tenant boundaries through real permission checks and RLS', async () => {
    await setRole('sales');
    expect(
      (await enableBatchTrackingAction({ productId, batches: [opening('A', '3', 5)] })).ok,
    ).toBe(false);
    await setRole('inventory', storeId);
    expect(
      (await enableBatchTrackingAction({ productId, batches: [opening('A', '3', 5)] })).ok,
    ).toBe(false);
    await setRole('inventory');
    await enable();
    const batch = (await lots())[0]!;
    const [foreign] = await db.insert(businesses).values({ name: 'Foreign batches' }).returning();
    tenants.push(foreign!.id);
    const rows = await withTenant(db, foreign!.id, (tx) => tx.select().from(stockBatches));
    expect(rows).toHaveLength(0);
    await expect(
      withTenant(db, foreign!.id, (tx) =>
        tx.insert(stockBatches).values({
          businessId: foreign!.id,
          productId,
          code: 'CROSS',
          quantity: '1',
          expiresOn: future(5),
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(db, foreign!.id, (tx) =>
        tx.insert(stockBatchMovements).values({
          businessId: foreign!.id,
          batchId: batch.id,
          kind: 'sale',
          documentId: randomUUID(),
          quantity: '-1',
        }),
      ),
    ).rejects.toThrow();
    const oldTenant = state.businessId;
    await db.update(user).set({ businessId: foreign!.id }).where(eq(user.id, state.id));
    state.businessId = foreign!.id;
    expect(
      (await reviewBatchAction({ batchId: batch.id, decision: 'hold', note: 'Not my lot' })).ok,
    ).toBe(false);
    state.businessId = oldTenant;
  });
  it('makes movement history append-only for the application role', async () => {
    await enable();
    await expect(
      withTenant(db, state.businessId, (tx) =>
        tx.execute(sql`DELETE FROM stock_batch_movements WHERE business_id = ${state.businessId}`),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(db, state.businessId, (tx) =>
        tx.execute(
          sql`UPDATE stock_batch_movements SET quantity=1 WHERE business_id = ${state.businessId}`,
        ),
      ),
    ).rejects.toThrow();
    await invariant();
  });
  it('scopes current expiry dashboard alerts by store and department without leaking costs', async () => {
    await enable([
      opening('EXPIRED', '1', -1),
      opening('SOON', '1', 5),
      opening('HOLD', '1', 20, true),
    ]);
    const ownDept = randomUUID();
    const hiddenDept = randomUUID();
    await db.insert(departments).values([
      { id: ownDept, businessId: state.businessId, storeId, name: 'Own' },
      { id: hiddenDept, businessId: state.businessId, storeId, name: 'Hidden' },
    ]);
    await db.update(products).set({ departmentId: ownDept }).where(eq(products.id, productId));
    const [hidden] = await db
      .insert(products)
      .values({
        businessId: state.businessId,
        storeId,
        departmentId: hiddenDept,
        name: 'Hidden batch product',
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '999',
        inventory: '1',
        batchTracking: true,
      })
      .returning();
    await db.insert(stockBatches).values({
      businessId: state.businessId,
      productId: hidden!.id,
      code: 'HIDDEN',
      expiresOn: future(-1),
      quantity: '1',
    });
    const owner = await loadWorkspaceDashboard(db, state.businessId, [{ role: 'super_admin' }], {
      view: 'overview',
    });
    expect(owner.insights.batches[0]?.expiredLots).toBe(2);
    const scoped = await loadWorkspaceDashboard(
      db,
      state.businessId,
      [{ role: 'floor_manager', storeId, departmentId: ownDept }],
      { view: 'inventory' },
    );
    expect(scoped.insights.batches).toHaveLength(3);
    expect(scoped.insights.batches.every((batch) => batch.productId === productId)).toBe(true);
    expect(scoped.insights.batches[0]?.expiredLots).toBe(1);
    expect(scoped.insights.batches[0]?.quarantineLots).toBe(1);
    expect(scoped.insights.batches[0]?.soonLots).toBe(1);
    expect(JSON.stringify(scoped.insights.batches)).not.toMatch(/cost|profit|HIDDEN|Hidden batch/);
    const [other] = await db
      .insert(stores)
      .values({ businessId: state.businessId, name: 'Other scope' })
      .returning();
    const empty = await loadWorkspaceDashboard(
      db,
      state.businessId,
      [{ role: 'inventory', storeId: other!.id }],
      { view: 'inventory' },
    );
    expect(empty.insights.batches).toHaveLength(0);
  });
});
