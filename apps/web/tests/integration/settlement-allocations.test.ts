import { randomUUID } from 'node:crypto';
import {
  businesses,
  customerOrderPayments,
  customerOrders,
  customers,
  emiPayments,
  emiSchedules,
  expenseEntries,
  products,
  purchaseItems,
  purchaseSettlementAllocations,
  purchaseSettlements,
  purchases,
  saleItems,
  sales,
  salesSettlementAllocations,
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
import { loadCashbook } from '@/lib/cashbook';
import { db } from '@/lib/db';
import { settlementRegister } from '@/lib/settlement-queries';
import { createPurchaseReturnAction } from '../../app/(app)/purchase-returns/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import {
  allocateExistingSettlementAction,
  createPurchaseSettlementAction,
  createSalesSettlementAction,
} from '../../app/(app)/settlements/actions';
const tenants: string[] = [];
let customerId = '';
let supplierId = '';
let storeId = '';
let productId = '';
let saleId = '';
let purchaseId = '';
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }) {
  expect(r.ok, r.ok ? '' : r.error).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const receipt = (extra: Record<string, unknown> = {}) =>
  createSalesSettlementAction({
    id: randomUUID(),
    customerId,
    amount: '40',
    paymentMethod: 'cash',
    billId: saleId,
    ...extra,
  });
const payment = (extra: Record<string, unknown> = {}) =>
  createPurchaseSettlementAction({
    id: randomUUID(),
    supplierId,
    amount: '40',
    paymentMethod: 'upi',
    billId: purchaseId,
    ...extra,
  });
const allocate = (settlementId: string, extra: Record<string, unknown> = {}) =>
  allocateExistingSettlementAction({
    id: randomUUID(),
    side: 'sales',
    settlementId,
    billId: saleId,
    amount: '40',
    note: 'Customer confirmed bill reference',
    ...extra,
  });
const book = () =>
  withTenant(db, state.businessId, (tx) =>
    loadCashbook(tx, state.businessId, '2020-01-01', '2099-12-31', 'all'),
  );
const register = () =>
  withTenant(db, state.businessId, (tx) => settlementRegister(tx, state.businessId, 'sales'));
const debt = async () =>
  (await db.select().from(customers).where(eq(customers.id, customerId)))[0]?.outstandingBalance;
describe.skipIf(process.env.DATABASE_URL !== url)(
  'bill allocation and cashbook on guarded PostgreSQL',
  () => {
    beforeAll(async () => {
      const [d] = await db.$client`SHOW data_directory`;
      if (!d?.data_directory.replaceAll('\\', '/').endsWith('/.cache/test-pgdata'))
        throw new Error('Unexpected database');
    });
    beforeEach(async () => {
      const [b] = await db
        .insert(businesses)
        .values({ name: 'Accounting regression', plan: 'pro' })
        .returning();
      if (!b) throw new Error('fixture');
      tenants.push(b.id);
      state.businessId = b.id;
      state.id = randomUUID();
      state.role = 'owner';
      state.storeId = null;
      await db.insert(user).values({
        id: state.id,
        businessId: b.id,
        name: 'Accountant',
        email: `${state.id}@example.invalid`,
        role: 'owner',
      });
      const [s] = await db.insert(stores).values({ businessId: b.id, name: 'Store' }).returning();
      const [c] = await db
        .insert(customers)
        .values({ businessId: b.id, name: 'Customer', outstandingBalance: '100' })
        .returning();
      const [v] = await db
        .insert(suppliers)
        .values({ businessId: b.id, name: 'Supplier', outstandingBalance: '100' })
        .returning();
      if (!s || !c || !v) throw new Error('fixture');
      storeId = s.id;
      customerId = c.id;
      supplierId = v.id;
      const [p] = await db
        .insert(products)
        .values({
          businessId: b.id,
          storeId,
          name: 'Item',
          unitType: 'piece',
          unitSymbol: 'pc',
          price: '10',
          inventory: '50',
        })
        .returning();
      if (!p) throw new Error('fixture');
      productId = p.id;
      const [bill] = await db
        .insert(sales)
        .values({
          businessId: b.id,
          storeId,
          customerId,
          customerName: 'Customer',
          billNo: 'CREDIT-1',
          subtotal: '100',
          total: '100',
          paymentMethod: 'credit',
          paymentStatus: 'due',
          billType: 'non_gst_bill',
        })
        .returning();
      if (!bill) throw new Error('fixture');
      saleId = bill.id;
      await db.insert(saleItems).values({
        businessId: b.id,
        saleId,
        productId,
        productName: 'Item',
        qty: '10',
        unitSymbol: 'pc',
        unitPrice: '10',
        lineTotal: '100',
      });
      const [pb] = await db
        .insert(purchases)
        .values({
          businessId: b.id,
          supplierId,
          supplierName: 'Supplier',
          billNo: 'PUR-1',
          subtotal: '100',
          total: '100',
          paymentMethod: 'credit',
        })
        .returning();
      if (!pb) throw new Error('fixture');
      purchaseId = pb.id;
      await db.insert(purchaseItems).values({
        purchaseId,
        productId,
        productName: 'Item',
        qty: '10',
        unitSymbol: 'pc',
        unitPrice: '10',
        lineTotal: '100',
      });
    });
    afterAll(async () => {
      for (const id of tenants) {
        await db
          .delete(salesSettlementAllocations)
          .where(eq(salesSettlementAllocations.businessId, id));
        await db
          .delete(purchaseSettlementAllocations)
          .where(eq(purchaseSettlementAllocations.businessId, id));
        await db.delete(sales).where(eq(sales.businessId, id));
        await db.delete(purchases).where(eq(purchases.businessId, id));
        await db.delete(businesses).where(eq(businesses.id, id));
      }
      await db.$client.end();
    });
    it('records a partial receipt atomically with its bill and party balances', async () => {
      ok(await receipt({ notes: 'X' }));
      expect(await debt()).toBe('60.00');
      expect((await register()).bills[0]?.remaining).toBe('60.00');
      expect((await register()).payments[0]?.unallocated).toBe('0.00');
      expect((await db.select().from(sales).where(eq(sales.id, saleId)))[0]?.paymentStatus).toBe(
        'partial',
      );
    });
    it('marks a fully allocated credit sale paid', async () => {
      ok(await receipt({ amount: '100' }));
      expect(await debt()).toBe('0.00');
      expect((await db.select().from(sales).where(eq(sales.id, saleId)))[0]?.paymentStatus).toBe(
        'paid',
      );
    });
    it('settles supplier bills partially without changing their original value', async () => {
      ok(await payment({ notes: 'X'.repeat(500) }));
      const d = await withTenant(db, state.businessId, (tx) =>
        settlementRegister(tx, state.businessId, 'purchases'),
      );
      expect(d.bills[0]?.remaining).toBe('60.00');
      expect(
        (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)))[0]
          ?.outstandingBalance,
      ).toBe('60.00');
    });
    it('replays a receipt once and rejects reuse with changed details', async () => {
      const id = randomUUID();
      ok(await receipt({ id }));
      ok(await receipt({ id }));
      expect(await debt()).toBe('60.00');
      expect((await receipt({ id, amount: '30' })).ok).toBe(false);
      expect((await register()).payments).toHaveLength(1);
    });
    it('replays a supplier payment once', async () => {
      const id = randomUUID();
      ok(await payment({ id }));
      ok(await payment({ id }));
      expect(
        await db
          .select()
          .from(purchaseSettlements)
          .where(eq(purchaseSettlements.businessId, state.businessId)),
      ).toHaveLength(1);
    });
    it('assigns an earlier supplier payment without paying twice', async () => {
      const p = ok(await payment({ billId: undefined }));
      ok(
        await allocateExistingSettlementAction({
          id: randomUUID(),
          side: 'purchases',
          settlementId: p.id,
          billId: purchaseId,
          amount: '40',
          note: 'Supplier confirmed bill reference',
        }),
      );
      const d = await withTenant(db, state.businessId, (tx) =>
        settlementRegister(tx, state.businessId, 'purchases'),
      );
      expect(d.bills[0]?.remaining).toBe('60.00');
      expect(d.payments[0]?.unallocated).toBe('0.00');
      expect((await book()).totals.outgoing).toBe('40.00');
    });
    it('serializes competing payments against the same bill', async () => {
      const results = await Promise.all([receipt({ amount: '80' }), receipt({ amount: '80' })]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await debt()).toBe('20.00');
    });
    it('rolls back excess allocation without recording money or reducing debt', async () => {
      await db
        .update(customers)
        .set({ outstandingBalance: '200' })
        .where(eq(customers.id, customerId));
      expect((await receipt({ amount: '101' })).ok).toBe(false);
      expect(await debt()).toBe('200.00');
      expect((await register()).payments).toHaveLength(0);
    });
    it('assigns an old receipt without a second debt reduction or cash movement', async () => {
      const r = ok(await receipt({ billId: undefined }));
      expect((await register()).bills[0]?.unallocated).toBe('40.00');
      const before = await book();
      ok(await allocate(r.id));
      expect(await debt()).toBe('60.00');
      expect((await register()).bills[0]?.remaining).toBe('60.00');
      expect((await book()).totals).toEqual(before.totals);
    });
    it('supports splitting an existing payment with a strict remaining amount', async () => {
      const r = ok(await receipt({ billId: undefined }));
      ok(await allocate(r.id, { amount: '15' }));
      expect((await allocate(r.id, { amount: '26' })).ok).toBe(false);
      ok(await allocate(r.id, { amount: '25' }));
      expect((await register()).payments[0]?.unallocated).toBe('0.00');
    });
    it('replays an allocation without duplicating its evidence', async () => {
      const r = ok(await receipt({ billId: undefined }));
      const id = randomUUID();
      ok(await allocate(r.id, { id }));
      ok(await allocate(r.id, { id }));
      expect((await allocate(r.id, { id, amount: '1' })).ok).toBe(false);
      expect((await register()).bills[0]?.remaining).toBe('60.00');
    });
    it('serializes allocation of the final unassigned payment amount', async () => {
      const r = ok(await receipt({ billId: undefined }));
      const results = await Promise.all([allocate(r.id), allocate(r.id)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });
    it('rejects a payment belonging to another customer', async () => {
      const r = ok(await receipt({ billId: undefined }));
      const [c] = await db
        .insert(customers)
        .values({ businessId: state.businessId, name: 'Other' })
        .returning();
      if (!c) throw new Error('fixture');
      await db.update(sales).set({ customerId: c.id }).where(eq(sales.id, saleId));
      expect((await allocate(r.id)).ok).toBe(false);
    });
    it('rejects order, EMI, estimate and paid cash documents as credit targets', async () => {
      for (const method of ['order', 'finance_emi', 'cash']) {
        await db.update(sales).set({ paymentMethod: method }).where(eq(sales.id, saleId));
        expect((await receipt()).ok).toBe(false);
      }
      await db
        .update(sales)
        .set({ paymentMethod: 'credit', billType: 'estimate' })
        .where(eq(sales.id, saleId));
      expect((await receipt()).ok).toBe(false);
    });
    it('allows returns against the unpaid portion after allocated collection', async () => {
      ok(await receipt());
      ok(
        await createSalesReturnAction({ originalSaleId: saleId, items: [{ productId, qty: '6' }] }),
      );
      expect(await debt()).toBe('0.00');
      expect((await register()).bills[0]?.remaining).toBe('0.00');
    });
    it('blocks credit returns crossing paid value and rolls back inventory', async () => {
      ok(await receipt());
      expect(
        (
          await createSalesReturnAction({
            originalSaleId: saleId,
            items: [{ productId, qty: '7' }],
          })
        ).ok,
      ).toBe(false);
      expect(
        (await db.select().from(products).where(eq(products.id, productId)))[0]?.inventory,
      ).toBe('50.000');
      expect(await debt()).toBe('60.00');
    });
    it('allows supplier returns only within their unpaid bill value', async () => {
      ok(await payment());
      expect(
        (
          await createPurchaseReturnAction({
            originalPurchaseId: purchaseId,
            items: [{ productId, qty: '7' }],
          })
        ).ok,
      ).toBe(false);
      ok(
        await createPurchaseReturnAction({
          originalPurchaseId: purchaseId,
          items: [{ productId, qty: '6' }],
        }),
      );
      expect(
        (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)))[0]
          ?.outstandingBalance,
      ).toBe('0.00');
    });
    it('keeps unallocated receipts conservative for credit returns', async () => {
      ok(await receipt({ billId: undefined }));
      expect(
        (
          await createSalesReturnAction({
            originalSaleId: saleId,
            items: [{ productId, qty: '1' }],
          })
        ).ok,
      ).toBe(false);
    });
    it('keeps legacy paid/partial flags conservative until earlier payment evidence is assigned', async () => {
      for (const status of ['paid', 'partial']) {
        await db.update(sales).set({ paymentStatus: status }).where(eq(sales.id, saleId));
        expect((await receipt()).ok).toBe(false);
        expect(
          (
            await createSalesReturnAction({
              originalSaleId: saleId,
              items: [{ productId, qty: '1' }],
            })
          ).ok,
        ).toBe(false);
      }
      const r = ok(await receipt({ billId: undefined }));
      ok(await allocate(r.id));
      ok(await receipt({ amount: '10' }));
      expect(await debt()).toBe('50.00');
    });
    it('protects allocation and payment evidence from application edits', async () => {
      ok(await receipt());
      for (const statement of [
        sql`UPDATE sales_settlement_allocations SET amount=1 WHERE business_id=${state.businessId}::uuid`,
        sql`DELETE FROM sales_settlement_allocations WHERE business_id=${state.businessId}::uuid`,
        sql`UPDATE sales_settlements SET amount=1 WHERE business_id=${state.businessId}::uuid`,
      ])
        await expect(
          withTenant(db, state.businessId, (tx) => tx.execute(statement)),
        ).rejects.toThrow();
    });
    it('enforces party and tenant links even on direct inserts', async () => {
      const r = ok(await receipt({ billId: undefined }));
      await expect(
        withTenant(db, state.businessId, (tx) =>
          tx.execute(
            sql`INSERT INTO sales_settlement_allocations(id,business_id,customer_id,settlement_id,sale_id,amount,note,request_hash) VALUES(${randomUUID()}::uuid,${state.businessId}::uuid,${randomUUID()}::uuid,${r.id}::uuid,${saleId}::uuid,1,'Evidence','hash')`,
          ),
        ),
      ).rejects.toThrow();
      const own = state.businessId;
      state.businessId = tenants[0] ?? randomUUID();
      if (state.businessId === own) state.businessId = randomUUID();
      expect((await receipt()).ok).toBe(false);
      state.businessId = own;
    });
    it('rejects sales-only staff from recording financial settlements', async () => {
      await db.update(user).set({ role: 'sales' }).where(eq(user.id, state.id));
      state.role = 'sales';
      expect((await receipt()).ok).toBe(false);
      expect((await payment()).ok).toBe(false);
    });
    it('hides both allocation ledgers from another tenant and rejects a forged tenant insert', async () => {
      const r = ok(await receipt());
      ok(await payment());
      const [b] = await db
        .insert(businesses)
        .values({ name: 'Other accounting tenant' })
        .returning();
      if (!b) throw new Error('Fixture');
      tenants.push(b.id);
      const hidden = await withTenant(db, b.id, async (tx) => ({
        sales: await tx.select().from(salesSettlementAllocations),
        purchases: await tx.select().from(purchaseSettlementAllocations),
      }));
      expect(hidden).toEqual({ sales: [], purchases: [] });
      await expect(
        withTenant(db, b.id, (tx) =>
          tx.execute(
            sql`INSERT INTO sales_settlement_allocations(id,business_id,customer_id,settlement_id,sale_id,amount,note,request_hash) VALUES(${randomUUID()}::uuid,${state.businessId}::uuid,${customerId}::uuid,${r.id}::uuid,${saleId}::uuid,1,'Forged tenant','hash')`,
          ),
        ),
      ).rejects.toThrow();
    });
    it('allows accounts staff to collect and pay without party-editing permissions', async () => {
      await db.update(user).set({ role: 'accounts' }).where(eq(user.id, state.id));
      state.role = 'accounts';
      ok(await receipt());
      ok(await payment());
      expect(await debt()).toBe('60.00');
    });
    it('counts recorded money once and groups card methods with India day boundaries', async () => {
      await db.insert(sales).values({
        businessId: state.businessId,
        storeId,
        billNo: 'CASH',
        subtotal: '25',
        total: '25',
        paymentMethod: 'card_debit',
        paymentStatus: 'paid',
        createdAt: new Date('2026-10-16T19:00:00Z'),
      });
      ok(await receipt());
      ok(await payment());
      await db.insert(expenseEntries).values({
        businessId: state.businessId,
        type: 'expense',
        category: 'Rent',
        amount: '10',
        description: 'Rent',
        paymentMethod: 'bank',
        entryDate: new Date('2026-10-16T19:00:00Z'),
      });
      const d = await book();
      expect(d.totals.incoming).toBe('65.00');
      expect(d.totals.outgoing).toBe('50.00');
      expect(d.totals.count).toBe('4');
      expect(d.rows.find((r) => r.kind === 'Sale')).toMatchObject({
        day: '2026-10-17',
        method: 'card',
      });
      const filtered = await withTenant(db, state.businessId, (tx) =>
        loadCashbook(tx, state.businessId, '2026-10-17', '2026-10-17', 'card'),
      );
      expect(filtered.totals.incoming).toBe('25.00');
      expect(filtered.rows).toHaveLength(1);
    });
    it('includes EMI interest and explicit order advances/refunds without counting deliveries', async () => {
      const [e] = await db
        .insert(emiSchedules)
        .values({
          businessId: state.businessId,
          customerId,
          financeCompany: 'Finance',
          principalAmount: '100',
          downPayment: '20',
          tenureMonths: 1,
          emiAmount: '90',
          startDate: '2026-10-17',
        })
        .returning();
      if (!e) throw new Error('fixture');
      await db.insert(emiPayments).values({
        businessId: state.businessId,
        emiScheduleId: e.id,
        instalmentNumber: 1,
        dueDate: '2026-10-17',
        paidDate: '2026-10-17',
        status: 'paid',
        amountPaid: '90',
        paymentMethod: 'cash',
      });
      const [o] = await db
        .insert(customerOrders)
        .values({
          id: randomUUID(),
          businessId: state.businessId,
          storeId,
          customerId,
          orderNo: 'O-1',
          customerName: 'Customer',
          deliveryAddress: 'Customer address',
          promisedOn: '2026-10-17',
          billType: 'non_gst_bill',
          gstEnabled: false,
          isInterstate: false,
          total: '100',
          requestHash: 'a'.repeat(64),
        })
        .returning();
      if (!o) throw new Error('fixture');
      await db.insert(customerOrderPayments).values([
        {
          id: randomUUID(),
          businessId: state.businessId,
          orderId: o.id,
          kind: 'receipt',
          amount: '40',
          method: 'bank_transfer',
          note: 'Advance',
          requestHash: 'a'.repeat(64),
        },
        {
          id: randomUUID(),
          businessId: state.businessId,
          orderId: o.id,
          kind: 'refund',
          amount: '5',
          method: 'bank_transfer',
          note: 'Refund',
          requestHash: 'b'.repeat(64),
        },
      ]);
      const d = await book();
      expect(d.totals.incoming).toBe('150.00');
      expect(d.totals.outgoing).toBe('5.00');
      expect(d.methods.find((m) => m.method === 'unknown')?.incoming).toBe('20.00');
    });
    it('paginates rows without truncating full-period totals and isolates tenants', async () => {
      await db.insert(expenseEntries).values(
        Array.from({ length: 101 }, (_, i) => ({
          businessId: state.businessId,
          type: 'income',
          category: 'Other',
          amount: '1',
          description: `Income ${i}`,
          paymentMethod: 'cash',
        })),
      );
      const d = await book();
      expect(d.rows).toHaveLength(100);
      expect(d.totals.incoming).toBe('101.00');
      const next = await withTenant(db, state.businessId, (tx) =>
        loadCashbook(tx, state.businessId, '2020-01-01', '2099-12-31', 'all', 2),
      );
      expect(next.rows).toHaveLength(1);
      expect(new Set([...d.rows, ...next.rows].map((r) => r.id)).size).toBe(101);
    });
  },
);
