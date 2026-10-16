import { randomUUID } from 'node:crypto';
import {
  businesses,
  departments,
  products,
  purchases,
  sales,
  stockSerialEvents,
  stockSerials,
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
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { db } from '@/lib/db';
import { warrantyEnd } from '@/lib/serial-policy';
import { sellableStockSql } from '@/lib/stock-batches';
import { loadWarranties } from '@/lib/warranty-queries';
import { loadWorkspaceDashboard } from '@/lib/workspace-dashboard';
import { createDamageLogAction } from '../../app/(app)/damage-logs/actions';
import { enableBatchTrackingAction } from '../../app/(app)/inventory/batches/actions';
import {
  configureWarrantyAction,
  enableSerialTrackingAction,
  reviewSerialAction,
} from '../../app/(app)/inventory/serials/actions';
import { deleteProductAction, updateProductAction } from '../../app/(app)/products/actions';
import { createPurchaseReturnAction } from '../../app/(app)/purchase-returns/actions';
import { createPurchaseAction } from '../../app/(app)/purchases/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import { createSaleAction } from '../../app/(app)/sales/actions';
let productId = '';
let storeId = '';
const tenants: string[] = [];
function success<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  expect(result.ok, result.ok ? '' : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
const activate = (
  serialNumbers = ['OPEN-A', 'OPEN-B'],
  warrantyMonths = 12,
  warrantyIssuer = 'Recorded manufacturer',
) => enableSerialTrackingAction({ productId, serialNumbers, warrantyMonths, warrantyIssuer });
const buy = (codes: string[], qty = String(codes.length)) =>
  createPurchaseAction({
    supplierId: '',
    supplierName: 'Serial supplier',
    paymentMethod: 'cash',
    items: [{ productId, qty, unitPrice: '50', serialNumbers: codes }],
  });
const sell = (
  codes: string[],
  qty = String(codes.length),
  billType = 'non_gst_bill',
  free = false,
) =>
  createSaleAction({
    storeId,
    paymentMethod: 'cash',
    discount: '0',
    billType,
    lines: [{ productId, qty, serialNumbers: codes, isFreeItem: free }],
  });
async function units() {
  return db.select().from(stockSerials).where(eq(stockSerials.productId, productId));
}
async function invariant() {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  expect((await units()).filter((u) => ['available', 'quarantine'].includes(u.state)).length).toBe(
    Number(product?.inventory),
  );
}
async function role(value: string, scope: string | null = null) {
  state.role = value;
  state.storeId = scope;
  await db.update(user).set({ role: value, storeId: scope }).where(eq(user.id, state.id));
}

describe.skipIf(process.env.DATABASE_URL !== url)(
  'serial inventory and warranty workflows on isolated PostgreSQL',
  () => {
    beforeAll(async () => {
      const [d] = await db.$client`SHOW data_directory`;
      if (!d?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
        throw new Error('Unexpected cluster');
    });
    beforeEach(async () => {
      const [business] = await db
        .insert(businesses)
        .values({ name: 'Serial regression', plan: 'pro' })
        .returning();
      if (!business) throw new Error('Fixture failed');
      state.businessId = business.id;
      tenants.push(business.id);
      state.id = randomUUID();
      state.role = 'owner';
      state.storeId = null;
      await db.insert(user).values({
        id: state.id,
        businessId: business.id,
        name: 'Serial tester',
        email: `${state.id}@example.invalid`,
        role: 'owner',
      });
      const [store] = await db
        .insert(stores)
        .values({ businessId: business.id, name: 'Electronics' })
        .returning();
      if (!store) throw new Error('Fixture failed');
      storeId = store.id;
      const [product] = await db
        .insert(products)
        .values({
          businessId: business.id,
          storeId,
          name: 'Serial speaker',
          unitType: 'piece',
          unitSymbol: 'pc',
          price: '100',
          costPrice: '50',
          inventory: '2',
        })
        .returning();
      if (!product) throw new Error('Fixture failed');
      productId = product.id;
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
    it('reconciles exact stock, normalizes serials and keeps all financial values unchanged', async () => {
      expect((await activate(['ONLY-ONE'])).ok).toBe(false);
      expect(await units()).toHaveLength(0);
      success(await activate([' open-a ', 'open-b']));
      expect((await units()).map((u) => u.code).sort()).toEqual(['OPEN-A', 'OPEN-B']);
      await invariant();
      expect((await activate()).ok).toBe(false);
    });
    it('rejects duplicate codes, invalid terms, fractional stock and non-piece products', async () => {
      expect((await activate(['SAME', 'same'])).ok).toBe(false);
      expect((await activate(undefined, 12, '')).ok).toBe(false);
      await db.update(products).set({ inventory: '1.5' }).where(eq(products.id, productId));
      expect((await activate(['A'])).ok).toBe(false);
      await db
        .update(products)
        .set({ inventory: '2', unitType: 'weight', unitSymbol: 'kg' })
        .where(eq(products.id, productId));
      expect((await activate()).ok).toBe(false);
      expect(await units()).toHaveLength(0);
    });
    it('keeps batch and serial tracking mutually exclusive', async () => {
      success(await activate());
      expect((await enableBatchTrackingAction({ productId, batches: [] })).ok).toBe(false);
      await expect(
        db.update(products).set({ batchTracking: true }).where(eq(products.id, productId)),
      ).rejects.toThrow();
    });
    it('allows zero-stock activation without inventing opening units', async () => {
      await db.update(products).set({ inventory: '0' }).where(eq(products.id, productId));
      success(await activate([]));
      expect(await units()).toHaveLength(0);
      await invariant();
    });
    it('requires one physical serial per received piece and rolls back duplicate receipts', async () => {
      success(await activate());
      expect((await buy([], '1')).ok).toBe(false);
      expect((await buy(['OPEN-A'])).ok).toBe(false);
      success(await buy(['NEW-A', 'NEW-B']));
      expect((await buy(['new-a'])).ok).toBe(false);
      await invariant();
      expect(await units()).toHaveLength(4);
    });
    it('allocates the exact scanned serials, including free units, and snapshots warranty terms', async () => {
      success(await activate());
      const bill = success(await sell(['open-b'], '1', 'non_gst_bill', true));
      expect(bill.total).toBe('0.00');
      expect((await units()).find((u) => u.code === 'OPEN-B')?.state).toBe('sold');
      expect((await units()).find((u) => u.code === 'OPEN-A')?.state).toBe('available');
      const [event] = await db
        .select()
        .from(stockSerialEvents)
        .where(
          and(
            eq(stockSerialEvents.businessId, state.businessId),
            eq(stockSerialEvents.kind, 'sale'),
          ),
        );
      const [document] = await db.select().from(sales).where(eq(sales.id, bill.id));
      expect(event?.warrantyMonths).toBe(12);
      expect(event?.warrantyIssuer).toBe('Recorded manufacturer');
      expect(event?.warrantyEndsOn).toBe(warrantyEnd(document!.createdAt, 12));
      await invariant();
    });
    it('rejects missing, duplicate, unknown and unavailable checkout serials atomically', async () => {
      success(await activate());
      for (const [codes, qty] of [
        [[], '1'],
        [['OPEN-A', 'OPEN-A'], '2'],
        [['UNKNOWN'], '1'],
        [['OPEN-A'], '0.5'],
      ] as [string[], string][]) {
        expect((await sell(codes, qty)).ok).toBe(false);
      }
      expect(
        await db.select().from(sales).where(eq(sales.businessId, state.businessId)),
      ).toHaveLength(0);
      await invariant();
    });
    it('does not reserve serials or create warranty records for estimates', async () => {
      success(await activate());
      success(await sell([], '1', 'estimate'));
      await invariant();
      expect(
        await db
          .select()
          .from(stockSerialEvents)
          .where(
            and(
              eq(stockSerialEvents.businessId, state.businessId),
              eq(stockSerialEvents.kind, 'sale'),
            ),
          ),
      ).toHaveLength(0);
    });
    it('serializes concurrent checkout of the same unit while other stock remains', async () => {
      success(await activate());
      const result = await Promise.all([sell(['OPEN-A']), sell(['OPEN-A'])]);
      expect(result.filter((r) => r.ok)).toHaveLength(1);
      await invariant();
    });
    it('quarantines partial returns and rejects a serial sold on another bill or returned twice', async () => {
      success(await activate());
      const a = success(await sell(['OPEN-A']));
      const b = success(await sell(['OPEN-B']));
      expect(
        (
          await createSalesReturnAction({
            originalSaleId: a.id,
            items: [{ productId, qty: '1', serialNumbers: ['OPEN-B'] }],
          })
        ).ok,
      ).toBe(false);
      success(
        await createSalesReturnAction({
          originalSaleId: a.id,
          items: [{ productId, qty: '1', serialNumbers: ['OPEN-A'] }],
        }),
      );
      expect(
        (
          await createSalesReturnAction({
            originalSaleId: a.id,
            items: [{ productId, qty: '1', serialNumbers: ['OPEN-A'] }],
          })
        ).ok,
      ).toBe(false);
      expect((await units()).find((u) => u.code === 'OPEN-A')?.state).toBe('quarantine');
      expect((await units()).find((u) => u.code === 'OPEN-B')?.lastSaleId).toBe(b.id);
      expect((await sell(['OPEN-A'])).ok).toBe(false);
      await invariant();
    });
    it('accepts an unregistered historical return in quarantine without inventing warranty facts', async () => {
      const old = success(await sell([], '1'));
      await db
        .update(sales)
        .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(sales.id, old.id));
      success(await activate(['REMAINING']));
      success(
        await createSalesReturnAction({
          originalSaleId: old.id,
          items: [{ productId, qty: '1', serialNumbers: ['HISTORICAL-RETURN'] }],
        }),
      );
      expect((await units()).find((u) => u.code === 'HISTORICAL-RETURN')?.state).toBe('quarantine');
      expect(
        (await loadWarranties(db, state.businessId, [{ role: 'super_admin' }])).rows,
      ).toHaveLength(0);
      await invariant();
    });
    it('releases inspected returns and preserves old warranty records after resale and term changes', async () => {
      success(await activate());
      const first = success(await sell(['OPEN-A']));
      success(
        await createSalesReturnAction({
          originalSaleId: first.id,
          items: [{ productId, qty: '1', serialNumbers: ['OPEN-A'] }],
        }),
      );
      const unit = (await units()).find((u) => u.code === 'OPEN-A')!;
      expect(
        (await reviewSerialAction({ serialId: unit.id, decision: 'release', note: '' })).ok,
      ).toBe(false);
      success(
        await reviewSerialAction({
          serialId: unit.id,
          decision: 'release',
          note: 'Checked exact serial and condition',
        }),
      );
      success(
        await configureWarrantyAction({
          productId,
          warrantyMonths: 6,
          warrantyIssuer: 'Store warranty',
        }),
      );
      const second = success(await sell(['OPEN-A']));
      const rows = (await loadWarranties(db, state.businessId, [{ role: 'super_admin' }], 'open-a'))
        .rows;
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.saleId === first.id)).toMatchObject({
        months: 12,
        issuer: 'Recorded manufacturer',
        returned: true,
      });
      expect(rows.find((r) => r.saleId === second.id)).toMatchObject({
        months: 6,
        issuer: 'Store warranty',
        returned: false,
      });
      await invariant();
    });
    it('records no warranty when configured to zero months', async () => {
      success(await activate(undefined, 0, ''));
      success(await sell(['OPEN-A']));
      const rows = (await loadWarranties(db, state.businessId, [{ role: 'super_admin' }])).rows;
      expect(rows[0]).toMatchObject({ months: 0, endsOn: null, issuer: null });
    });
    it('supports recall quarantine and blocks checkout until inspected release', async () => {
      success(await activate());
      const unit = (await units())[0]!;
      success(
        await reviewSerialAction({
          serialId: unit.id,
          decision: 'hold',
          note: 'Supplier recall inspection',
        }),
      );
      expect((await sell([unit.code])).ok).toBe(false);
      success(
        await reviewSerialAction({
          serialId: unit.id,
          decision: 'release',
          note: 'Inspection completed',
        }),
      );
      success(await sell([unit.code]));
      await invariant();
    });
    it('removes exact units for damage and serializes damage against checkout', async () => {
      success(await activate());
      const input = { productId, qty: '1', reason: 'damaged', serialNumbers: ['OPEN-A'] };
      const results = await Promise.all([sell(['OPEN-A']), createDamageLogAction(input)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      await invariant();
      expect((await createDamageLogAction({ ...input, serialNumbers: ['UNKNOWN'] })).ok).toBe(
        false,
      );
    });
    it('restricts supplier returns to units from the original receipt, then allows re-receipt', async () => {
      success(await activate());
      const receipt = success(await buy(['SUPPLIER-A']));
      expect(
        (
          await createPurchaseReturnAction({
            originalPurchaseId: receipt.id,
            items: [{ productId, qty: '1', serialNumbers: ['OPEN-A'] }],
          })
        ).ok,
      ).toBe(false);
      success(
        await createPurchaseReturnAction({
          originalPurchaseId: receipt.id,
          items: [{ productId, qty: '1', serialNumbers: ['SUPPLIER-A'] }],
        }),
      );
      expect((await units()).find((u) => u.code === 'SUPPLIER-A')?.state).toBe('supplier_return');
      success(await buy(['SUPPLIER-A']));
      expect((await units()).find((u) => u.code === 'SUPPLIER-A')?.state).toBe('available');
      await invariant();
    });
    it('permits physical opening serials for a genuinely historical supplier return', async () => {
      const receipt = success(await buy([], '1'));
      await db
        .update(purchases)
        .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(purchases.id, receipt.id));
      success(await activate(['OPEN-A', 'OPEN-B', 'OLD-RECEIPT']));
      success(
        await createPurchaseReturnAction({
          originalPurchaseId: receipt.id,
          items: [{ productId, qty: '1', serialNumbers: ['OLD-RECEIPT'] }],
        }),
      );
      await invariant();
    });
    it('prevents product edits and deletion from bypassing tracked inventory', async () => {
      success(await activate());
      expect((await deleteProductAction({ id: productId })).ok).toBe(false);
      const input = {
        id: productId,
        name: 'Serial speaker',
        storeId,
        categoryId: '',
        brandId: '',
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '100',
        costPrice: '50',
        mrp: '',
        wholesalePrice: '',
        rate1: '',
        rate2: '',
        rate3: '',
        rate4: '',
        minStock: '',
        inventory: '3',
        gstRate: '',
      };
      expect((await updateProductAction(input)).ok).toBe(false);
      expect(
        (
          await updateProductAction({
            ...input,
            inventory: '2',
            unitType: 'weight',
            unitSymbol: 'kg',
          })
        ).ok,
      ).toBe(false);
      success(await updateProductAction({ ...input, inventory: '2', name: 'Renamed speaker' }));
      await invariant();
    });
    it('detects stock drift before saving a document', async () => {
      success(await activate());
      await db.update(products).set({ inventory: '3' }).where(eq(products.id, productId));
      expect((await sell(['OPEN-A'])).ok).toBe(false);
      expect(
        await db.select().from(sales).where(eq(sales.businessId, state.businessId)),
      ).toHaveLength(0);
    });
    it('enforces global inventory gates and scoped warranty access with real permissions', async () => {
      await role('sales');
      expect((await activate()).ok).toBe(false);
      await role('inventory', storeId);
      expect((await activate()).ok).toBe(false);
      await role('inventory');
      success(await activate());
      await expect(loadWarranties(db, state.businessId, [{ role: 'inventory' }])).rejects.toThrow(
        'Permission denied',
      );
      await role('owner');
      success(await sell(['OPEN-A']));
      expect(
        (await loadWarranties(db, state.businessId, [{ role: 'sales', storeId }])).rows,
      ).toHaveLength(1);
      await expect(
        loadWarranties(db, state.businessId, [
          { role: 'floor_manager', storeId, departmentId: randomUUID() },
        ]),
      ).rejects.toThrow('Permission denied');
      const [other] = await db
        .insert(stores)
        .values({ businessId: state.businessId, name: 'Other store' })
        .returning();
      expect(
        (await loadWarranties(db, state.businessId, [{ role: 'sales', storeId: other!.id }])).rows,
      ).toHaveLength(0);
    });
    it('enforces tenant keys, hides records from other tenants and makes events append-only', async () => {
      success(await activate());
      const unit = (await units())[0]!;
      const [foreign] = await db
        .insert(businesses)
        .values({ name: 'Foreign serial tenant' })
        .returning();
      if (!foreign) throw new Error('Fixture failed');
      tenants.push(foreign.id);
      expect(await withTenant(db, foreign.id, (tx) => tx.select().from(stockSerials))).toHaveLength(
        0,
      );
      await expect(
        withTenant(db, foreign.id, (tx) =>
          tx
            .insert(stockSerials)
            .values({ businessId: foreign.id, productId, code: 'CROSS', state: 'available' }),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, foreign.id, (tx) =>
          tx.insert(stockSerialEvents).values({
            businessId: foreign.id,
            serialId: unit.id,
            kind: 'opening',
            documentId: productId,
          }),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(sql`DELETE FROM stock_serial_events WHERE business_id=${state.businessId}`),
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(
            sql`UPDATE stock_serial_events SET warranty_months=0 WHERE business_id=${state.businessId}`,
          ),
        ),
      ).rejects.toThrow();
    });
    it('scopes serial quarantine dashboard alerts without customer or cost fields', async () => {
      success(await activate());
      const bill = success(await sell(['OPEN-A']));
      success(
        await createSalesReturnAction({
          originalSaleId: bill.id,
          items: [{ productId, qty: '1', serialNumbers: ['OPEN-A'] }],
        }),
      );
      const dept = randomUUID();
      await db
        .insert(departments)
        .values({ id: dept, businessId: state.businessId, storeId, name: 'Audio' });
      await db.update(products).set({ departmentId: dept }).where(eq(products.id, productId));
      const scoped = await loadWorkspaceDashboard(
        db,
        state.businessId,
        [{ role: 'floor_manager', storeId, departmentId: dept }],
        { view: 'inventory' },
      );
      expect(scoped.insights.serials).toHaveLength(1);
      expect(scoped.insights.serials[0]).toMatchObject({ id: productId, quantity: 1 });
      expect(JSON.stringify(scoped.insights.serials)).not.toMatch(/customer|cost|warranty|billNo/);
      const [available] = await withTenant(db, state.businessId, (tx) =>
        tx.select({ stock: sellableStockSql }).from(products).where(eq(products.id, productId)),
      );
      expect(Number(available?.stock)).toBe(1);
    });
  },
);
