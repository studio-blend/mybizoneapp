import { randomUUID } from 'node:crypto';
import {
  auditLogs,
  billCounters,
  businesses,
  customers,
  damageLogs,
  emiPayments,
  emiSchedules,
  expenseEntries,
  invoices,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchaseSettlements,
  purchases,
  returnItems,
  saleItems,
  sales,
  salesReturns,
  salesSettlements,
  stores,
  suppliers,
  user as users,
} from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// This suite can write ONLY to the disposable release database; never falls back
// to a developer or production DATABASE_URL. All fixture tenants are cleaned up.
const isolatedUrl = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const enabled = process.env.DATABASE_URL === isolatedUrl;
const state = vi.hoisted(() => ({ userId: '', businessId: '' }));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
vi.mock('@/lib/session', () => ({
  requireUser: async () => ({
    id: state.userId,
    businessId: state.businessId,
    role: 'owner',
    storeId: null,
  }),
}));
vi.mock('@/lib/require-permission', () => ({ requirePermission: vi.fn(async () => {}) }));
vi.mock('@/lib/storage', () => ({
  uploadFile: vi.fn(async () => ({ key: 'invoices/regression.pdf' })),
}));
vi.mock('@mybizone/pdf/invoice', () => ({
  renderInvoicePdf: vi.fn(async () => Buffer.from('mock-pdf')),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { db } from '@/lib/db';
import { getClosingStock } from '@/lib/reports/closing-stock';
import { getProfitLoss } from '@/lib/reports/profit-loss';
import { withTenant } from '@mybizone/db/tenant';
import { renderInvoicePdf } from '@mybizone/pdf/invoice';
import { createDamageLogAction } from '../../app/(app)/damage-logs/actions';
import { recordEmiPaymentAction } from '../../app/(app)/emi/actions';
import { generateInvoiceAction } from '../../app/(app)/invoices/actions';
import { createPurchaseReturnAction } from '../../app/(app)/purchase-returns/actions';
import { createSalesReturnAction } from '../../app/(app)/returns/actions';
import { createSaleAction } from '../../app/(app)/sales/actions';
import {
  createPurchaseSettlementAction,
  createSalesSettlementAction,
} from '../../app/(app)/settlements/actions';

const fixtureBusinesses: string[] = [];
let storeId = '';
let customerId = '';
let productId = '';

async function saleFixture(paymentMethod = 'cash') {
  const [sale] = await db
    .insert(sales)
    .values({
      businessId: state.businessId,
      storeId,
      customerId,
      customerName: 'Customer',
      billNo: randomUUID(),
      subtotal: '84.75',
      taxTotal: '15.25',
      gstEnabledAtSale: true,
      businessGstinAtSale: null,
      isInterstate: false,
      cgst: '7.63',
      sgst: '7.62',
      igst: '0',
      total: '100',
      paymentMethod,
      paymentStatus: 'due',
    })
    .returning();
  if (!sale) throw new Error('fixture failed');
  await db.insert(saleItems).values({
    businessId: state.businessId,
    saleId: sale.id,
    productId,
    productName: 'Original product',
    qty: '3',
    unitSymbol: 'pc',
    unitPrice: '50',
    lineTotal: '100',
    gstAmount: '15.25',
  });
  return sale;
}

describe.skipIf(!enabled)('transaction actions against isolated PostgreSQL', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const [business] = await db
      .insert(businesses)
      .values({ name: 'Transaction regression' })
      .returning();
    if (!business) throw new Error('fixture failed');
    state.businessId = business.id;
    fixtureBusinesses.push(business.id);
    state.userId = randomUUID();
    await db.insert(users).values({
      id: state.userId,
      name: 'Release tester',
      email: `${state.userId}@example.invalid`,
      businessId: business.id,
      role: 'owner',
    });
    const [store] = await db
      .insert(stores)
      .values({ businessId: business.id, name: 'Regression store' })
      .returning();
    const [customer] = await db
      .insert(customers)
      .values({ businessId: business.id, name: 'Customer', outstandingBalance: '100' })
      .returning();
    if (!store || !customer) throw new Error('fixture failed');
    storeId = store.id;
    customerId = customer.id;
    const [product] = await db
      .insert(products)
      .values({
        businessId: business.id,
        storeId,
        name: 'Current product',
        unitType: 'piece',
        unitSymbol: 'pc',
        price: '900',
        inventory: '1',
      })
      .returning();
    if (!product) throw new Error('fixture failed');
    productId = product.id;
  });

  afterAll(async () => {
    for (const businessId of fixtureBusinesses) {
      // Sales store FK is restrictive, so clear documents before tenant cascade.
      await db.delete(sales).where(eq(sales.businessId, businessId));
      await db.delete(businesses).where(eq(businesses.id, businessId));
    }
    const client = (db as unknown as { $client?: { end: () => Promise<void> } }).$client;
    await client?.end();
  });

  it('rolls back excessive damage without changing stock, damage records or audit logs', async () => {
    const result = await createDamageLogAction({ productId, qty: '2', reason: 'damaged' });
    expect(result).toEqual({ ok: false, error: 'Damage exceeds available stock' });
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    const logs = await db
      .select()
      .from(damageLogs)
      .where(eq(damageLogs.businessId, state.businessId));
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.businessId, state.businessId));
    expect(product?.inventory).toBe('1.000');
    expect(logs).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('allows only one concurrent damage request for the final unit', async () => {
    const input = { productId, qty: '1', reason: 'damaged' };
    const results = await Promise.all([createDamageLogAction(input), createDamageLogAction(input)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: 'Damage exceeds available stock',
    });
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    const logs = await db
      .select()
      .from(damageLogs)
      .where(eq(damageLogs.businessId, state.businessId));
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.businessId, state.businessId));
    expect(product?.inventory).toBe('0.000');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.qty).toBe('1.000');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entityId).toBe(logs[0]?.id);
  });

  it('issues one invoice number across simultaneous generation and later retries', async () => {
    const sale = await saleFixture();
    const results = await Promise.all([
      generateInvoiceAction({ saleId: sale.id }),
      generateInvoiceAction({ saleId: sale.id }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const numbers = results.map((r) => (r.ok ? r.data.invoiceNo : 'error'));
    expect(new Set(numbers).size).toBe(1);
    await db
      .update(businesses)
      .set({ name: 'Renamed business', gstin: '27AAAAA0000A1Z5' })
      .where(eq(businesses.id, state.businessId));
    const retry = await generateInvoiceAction({ saleId: sale.id });
    expect(retry.ok && retry.data.invoiceNo).toBe(numbers[0]);
    const rows = await db.select().from(invoices).where(eq(invoices.saleId, sale.id));
    const [counter] = await db
      .select()
      .from(billCounters)
      .where(eq(billCounters.businessId, state.businessId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.businessGstin).toBeNull();
    expect(counter?.lastInvoiceNo).toBe(1);
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'freezes sale tax through delayed invoice and missing-PDF recovery (interstate=%s)',
    async (isInterstate) => {
      await db
        .update(businesses)
        .set({ gstEnabled: true, gstin: '27AAAAA0000A1Z5' })
        .where(eq(businesses.id, state.businessId));
      await db
        .update(products)
        .set({ price: '100', gstRate: '18' })
        .where(eq(products.id, productId));
      const result = await createSaleAction({
        storeId,
        paymentMethod: 'cash',
        discount: '0',
        isInterstate,
        lines: [{ productId, qty: '1' }],
      });
      if (!result.ok) throw new Error(result.error);
      await db
        .update(businesses)
        .set({ gstEnabled: false, gstin: '29BBBBB0000B1Z5' })
        .where(eq(businesses.id, state.businessId));
      const issued = await generateInvoiceAction({ saleId: result.data.id });
      expect(issued.ok).toBe(true);
      const expected = {
        businessGstin: '27AAAAA0000A1Z5',
        isInterstate,
        cgst: isInterstate ? '0.00' : '9.00',
        sgst: isInterstate ? '0.00' : '9.00',
        igst: isInterstate ? '18.00' : '0.00',
      };
      const [invoice] = await db.select().from(invoices).where(eq(invoices.saleId, result.data.id));
      expect(invoice).toMatchObject(expected);
      expect(vi.mocked(renderInvoicePdf).mock.calls[0]?.[0]).toMatchObject({
        isGstInvoice: true,
        business: { gstin: expected.businessGstin },
        totals: { cgst: expected.cgst, sgst: expected.sgst, igst: expected.igst },
      });
      await db.update(invoices).set({ pdfKey: null }).where(eq(invoices.saleId, result.data.id));
      const recovered = await generateInvoiceAction({ saleId: result.data.id });
      expect(recovered).toEqual(issued);
      expect(vi.mocked(renderInvoicePdf).mock.calls[1]?.[0]).toMatchObject({
        isGstInvoice: true,
        business: { gstin: expected.businessGstin },
      });
    },
  );

  it('keeps a non-GST receipt non-GST after registration and blocks unknown legacy tax', async () => {
    const result = await createSaleAction({
      storeId,
      paymentMethod: 'cash',
      billType: 'non_gst_bill',
      discount: '0',
      lines: [{ productId, qty: '1' }],
    });
    if (!result.ok) throw new Error(result.error);
    await db
      .update(businesses)
      .set({ gstEnabled: true, gstin: '27AAAAA0000A1Z5' })
      .where(eq(businesses.id, state.businessId));
    expect((await generateInvoiceAction({ saleId: result.data.id })).ok).toBe(true);
    expect(vi.mocked(renderInvoicePdf).mock.calls[0]?.[0]).toMatchObject({
      isGstInvoice: false,
      business: { gstin: null },
      totals: { cgst: '0.00', sgst: '0.00', igst: '0.00' },
    });
    const legacy = await saleFixture();
    await db
      .update(sales)
      .set({ gstEnabledAtSale: null, isInterstate: null, cgst: null, sgst: null, igst: null })
      .where(eq(sales.id, legacy.id));
    const blocked = await generateInvoiceAction({ saleId: legacy.id });
    expect(!blocked.ok && blocked.error).toContain('Historical sale tax context is missing');
    expect(await db.select().from(invoices).where(eq(invoices.saleId, legacy.id))).toHaveLength(0);
  });

  it('blocks credit returns after an unallocated customer receipt without touching stock or debt', async () => {
    const sale = await saleFixture('credit');
    expect(
      (await createSalesSettlementAction({ customerId, amount: '80', paymentMethod: 'cash' })).ok,
    ).toBe(true);
    const result = await createSalesReturnAction({
      originalSaleId: sale.id,
      items: [{ productId, qty: '3' }],
    });
    expect(!result.ok && result.error).toContain('payment allocation reconciliation');
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(customer?.outstandingBalance).toBe('20.00');
    expect(product?.inventory).toBe('1.000');
    expect(
      await db.select().from(salesReturns).where(eq(salesReturns.originalSaleId, sale.id)),
    ).toHaveLength(0);
  });

  it('serializes a full credit return against a competing unallocated receipt', async () => {
    const sale = await saleFixture('credit');
    const results = await Promise.all([
      createSalesReturnAction({ originalSaleId: sale.id, items: [{ productId, qty: '3' }] }),
      createSalesSettlementAction({ customerId, amount: '80', paymentMethod: 'cash' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(customer?.outstandingBalance).toBe(results[0]?.ok ? '0.00' : '20.00');
    expect(product?.inventory).toBe(results[0]?.ok ? '4.000' : '1.000');
  });

  it('rolls back a credit return when historical debt is insufficient', async () => {
    const sale = await saleFixture('credit');
    await db
      .update(customers)
      .set({ outstandingBalance: '20' })
      .where(eq(customers.id, customerId));
    const result = await createSalesReturnAction({
      originalSaleId: sale.id,
      items: [{ productId, qty: '3' }],
    });
    expect(!result.ok && result.error).toContain('exceeds recorded debt');
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(product?.inventory).toBe('1.000');
    expect(
      await db.select().from(salesReturns).where(eq(salesReturns.originalSaleId, sale.id)),
    ).toHaveLength(0);
  });

  it('rejects ambiguous duplicate-line return costs', async () => {
    const sale = await saleFixture();
    await db.insert(saleItems).values({
      businessId: state.businessId,
      saleId: sale.id,
      productId,
      productName: 'Second cost',
      qty: '1',
      unitSymbol: 'pc',
      unitPrice: '10',
      lineTotal: '10',
      costPriceAtSale: '5',
    });
    const result = await createSalesReturnAction({
      originalSaleId: sale.id,
      items: [{ productId, qty: '1' }],
    });
    expect(!result.ok && result.error).toContain('original-line cost reconciliation');
  });

  it('reconstructs opening stock and reverses every movement after India midnight', async () => {
    const before = new Date('2026-01-01T00:00:00Z');
    const after = new Date('2026-01-02T18:30:00Z'); // Jan 3 midnight in India
    await db
      .update(products)
      .set({ inventory: '17', createdAt: before })
      .where(eq(products.id, productId));
    const sale = await saleFixture();
    await db.update(sales).set({ createdAt: after }).where(eq(sales.id, sale.id)); // -3
    const [purchase] = await db
      .insert(purchases)
      .values({
        businessId: state.businessId,
        supplierName: 'Supplier',
        billNo: randomUUID(),
        subtotal: '50',
        total: '50',
        paymentMethod: 'cash',
        purchaseDate: after,
      })
      .returning();
    await db.insert(purchaseItems).values({
      purchaseId: purchase!.id,
      productId,
      productName: 'Original product',
      qty: '5',
      unitSymbol: 'pc',
      unitPrice: '10',
      lineTotal: '50',
      gstAmount: '0',
    });
    const [sr] = await db
      .insert(salesReturns)
      .values({
        businessId: state.businessId,
        originalSaleId: sale.id,
        returnNo: randomUUID(),
        subtotal: '10',
        total: '10',
        createdAt: after,
      })
      .returning();
    await db.insert(returnItems).values({
      returnId: sr!.id,
      productId,
      productName: 'Product',
      qty: '1',
      unitSymbol: 'pc',
      unitPrice: '10',
      lineTotal: '10',
    });
    const [pr] = await db
      .insert(purchaseReturns)
      .values({
        businessId: state.businessId,
        originalPurchaseId: purchase!.id,
        supplierName: 'Supplier',
        returnNo: randomUUID(),
        subtotal: '20',
        total: '20',
        createdAt: after,
      })
      .returning();
    await db.insert(purchaseReturnItems).values({
      returnId: pr!.id,
      productId,
      productName: 'Product',
      qty: '2',
      unitSymbol: 'pc',
      unitPrice: '10',
      lineTotal: '20',
    });
    await db.insert(damageLogs).values({
      businessId: state.businessId,
      productId,
      productName: 'Product',
      qty: '1',
      unitSymbol: 'pc',
      reason: 'damaged',
      loggedAt: after,
    });
    await db.insert(auditLogs).values({
      businessId: state.businessId,
      action: 'product.update',
      entity: 'product',
      entityId: productId,
      before: { inventory: '10' },
      after: { inventory: '17' },
      createdAt: after,
    });
    // Opening 10 + purchase5 - sale3 + sales return1 - purchase return2 - damage1 + manual7 = current17.
    const rows = await withTenant(db, state.businessId, (tx) => getClosingStock(tx, '2026-01-02'));
    expect(Number(rows.find((r) => r.id === productId)?.closing_qty)).toBe(10);
    const current = await withTenant(db, state.businessId, (tx) =>
      getClosingStock(tx, '2026-01-03'),
    );
    expect(Number(current.find((r) => r.id === productId)?.closing_qty)).toBe(17);
    await db.insert(auditLogs).values({
      businessId: state.businessId,
      action: 'product.update',
      entity: 'product',
      entityId: productId,
      before: { price: '10' },
      after: { price: '11' },
      createdAt: after,
    });
    const incomplete = await withTenant(db, state.businessId, (tx) =>
      getClosingStock(tx, '2026-01-02'),
    );
    expect(incomplete.find((r) => r.id === productId)?.incomplete_adjustments).toBe(1);
  });

  it('serializes competing returns and values the winner from original invoice totals', async () => {
    const sale = await saleFixture();
    const input = { originalBillNo: sale.billNo, items: [{ productId, qty: '2' }] };
    const results = await Promise.all([
      createSalesReturnAction(input),
      createSalesReturnAction(input),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const winner = results.find((r) => r.ok);
    expect(winner?.ok && winner.data.total).toBe('66.67');
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    const returns = await db
      .select()
      .from(salesReturns)
      .where(eq(salesReturns.originalSaleId, sale.id));
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(product?.inventory).toBe('3.000');
    expect(returns).toHaveLength(1);
    expect(returns[0]?.taxTotal).toBe('10.17');
    expect(customer?.outstandingBalance).toBe('100.00'); // cash refund cannot erase unrelated debt
  });

  it('serializes receipts so concurrent payments cannot silently overpay', async () => {
    const input = { customerId, amount: '80', paymentMethod: 'cash' };
    const results = await Promise.all([
      createSalesSettlementAction(input),
      createSalesSettlementAction(input),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const receipts = await db
      .select()
      .from(salesSettlements)
      .where(eq(salesSettlements.customerId, customerId));
    expect(customer?.outstandingBalance).toBe('20.00');
    expect(receipts).toHaveLength(1);
  });

  it('serializes supplier payments and blocks a settled credit purchase return', async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({ businessId: state.businessId, name: 'Supplier', outstandingBalance: '100' })
      .returning();
    const input = { supplierId: supplier!.id, amount: '80', paymentMethod: 'cash' };
    const results = await Promise.all([
      createPurchaseSettlementAction(input),
      createPurchaseSettlementAction(input),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [purchase] = await db
      .insert(purchases)
      .values({
        businessId: state.businessId,
        supplierId: supplier!.id,
        supplierName: 'Supplier',
        billNo: randomUUID(),
        subtotal: '100',
        total: '100',
        paymentMethod: 'credit',
      })
      .returning();
    await db.insert(purchaseItems).values({
      purchaseId: purchase!.id,
      productId,
      productName: 'Product',
      qty: '1',
      unitSymbol: 'pc',
      unitPrice: '100',
      lineTotal: '100',
    });
    const result = await createPurchaseReturnAction({
      originalPurchaseId: purchase!.id,
      items: [{ productId, qty: '1' }],
    });
    expect(!result.ok && result.error).toContain('payment allocation reconciliation');
    const [party] = await db.select().from(suppliers).where(eq(suppliers.id, supplier!.id));
    expect(party?.outstandingBalance).toBe('20.00');
    expect(
      await db
        .select()
        .from(purchaseSettlements)
        .where(eq(purchaseSettlements.supplierId, supplier!.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.originalPurchaseId, purchase!.id)),
    ).toHaveLength(0);
  });

  it('protects EMI principal during concurrent general receipt and instalment collection', async () => {
    await db
      .update(customers)
      .set({ outstandingBalance: '0.30' })
      .where(eq(customers.id, customerId));
    const sale = await saleFixture('finance_emi');
    const [schedule] = await db
      .insert(emiSchedules)
      .values({
        businessId: state.businessId,
        saleId: sale.id,
        customerId,
        financeCompany: 'Test',
        principalAmount: '0.10',
        downPayment: '0',
        tenureMonths: 1,
        emiAmount: '0.10',
        startDate: '2026-01-01',
      })
      .returning();
    const [payment] = await db
      .insert(emiPayments)
      .values({
        businessId: state.businessId,
        emiScheduleId: schedule!.id,
        instalmentNumber: 1,
        dueDate: '2026-02-01',
      })
      .returning();
    const blocked = await createSalesSettlementAction({
      customerId,
      amount: '0.21',
      paymentMethod: 'cash',
    });
    expect(!blocked.ok && blocked.error).toContain('EMI principal');
    const results = await Promise.all([
      createSalesSettlementAction({ customerId, amount: '0.20', paymentMethod: 'cash' }),
      recordEmiPaymentAction({
        paymentId: payment!.id,
        scheduleId: schedule!.id,
        amountPaid: '0.10',
        paidDate: '2026-02-01',
        paymentMethod: 'cash',
      }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(customer?.outstandingBalance).toBe('0.00');
  });

  it('calculates P&L excluding GST, including free stock cost and reversing returned original cost', async () => {
    const date = new Date('2026-01-02T12:00:00+05:30');
    const sale = await saleFixture();
    await db.update(sales).set({ createdAt: date }).where(eq(sales.id, sale.id));
    await db.update(saleItems).set({ costPriceAtSale: '10' }).where(eq(saleItems.saleId, sale.id));
    await db.insert(saleItems).values({
      businessId: state.businessId,
      saleId: sale.id,
      productId,
      productName: 'Free gift',
      qty: '1',
      unitSymbol: 'pc',
      unitPrice: '0',
      lineTotal: '0',
      costPriceAtSale: '5',
      isFreeItem: true,
    });
    const [returned] = await db
      .insert(salesReturns)
      .values({
        businessId: state.businessId,
        originalSaleId: sale.id,
        returnNo: randomUUID(),
        subtotal: '28.25',
        taxTotal: '5.08',
        total: '33.33',
        createdAt: date,
      })
      .returning();
    await db.insert(returnItems).values({
      returnId: returned!.id,
      productId,
      productName: 'Returned',
      qty: '1',
      unitSymbol: 'pc',
      unitPrice: '50',
      lineTotal: '33.33',
      gstAmount: '5.08',
      costPriceAtSale: '10',
    });
    await db.update(products).set({ costPrice: '999' }).where(eq(products.id, productId));
    const excluded = await saleFixture();
    await db
      .update(sales)
      .set({ createdAt: new Date('2026-01-03T00:00:00+05:30') })
      .where(eq(sales.id, excluded.id));
    const estimate = await saleFixture();
    await db
      .update(sales)
      .set({ createdAt: date, billType: 'estimate' })
      .where(eq(sales.id, estimate.id));
    await db.insert(expenseEntries).values({
      businessId: state.businessId,
      category: 'Other',
      type: 'expense',
      amount: '6.50',
      description: 'Regression expense',
      entryDate: date,
    });
    const report = await withTenant(db, state.businessId, (tx) =>
      getProfitLoss(
        tx,
        state.businessId,
        new Date('2026-01-02T00:00:00+05:30'),
        new Date('2026-01-03T00:00:00+05:30'),
      ),
    );
    expect(report).toMatchObject({ revenue: 84.75, returns: 28.25, cogs: 25 });
    expect(report.expenseByCategory).toEqual([
      { category: 'Other', type: 'expense', total: '6.50' },
    ]);
    expect(report.revenue - report.returns - report.cogs - 6.5).toBe(25);
  });

  it('collects an instalment once, excludes interest and completes concurrent final instalments', async () => {
    const sale = await saleFixture('finance_emi');
    const [schedule] = await db
      .insert(emiSchedules)
      .values({
        businessId: state.businessId,
        saleId: sale.id,
        customerId,
        financeCompany: 'Test finance',
        principalAmount: '110',
        downPayment: '10',
        tenureMonths: 3,
        emiAmount: '40',
        startDate: '2026-01-31',
      })
      .returning();
    if (!schedule) throw new Error('fixture failed');
    const payments = await db
      .insert(emiPayments)
      .values(
        [1, 2, 3].map((instalmentNumber) => ({
          businessId: state.businessId,
          emiScheduleId: schedule.id,
          instalmentNumber,
          dueDate: '2026-02-28',
        })),
      )
      .returning();
    const pay = (paymentId: string) =>
      recordEmiPaymentAction({
        paymentId,
        scheduleId: schedule.id,
        amountPaid: '40',
        paidDate: '2026-02-28',
        paymentMethod: 'cash',
      });
    const firstId = payments[0]!.id;
    const duplicate = await Promise.all([pay(firstId), pay(firstId)]);
    expect(duplicate.filter((r) => r.ok)).toHaveLength(1);
    const [partPaid] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(partPaid?.outstandingBalance).toBe('66.67');
    const remainder = await Promise.all(payments.slice(1).map((p) => pay(p.id)));
    expect(remainder.every((r) => r.ok)).toBe(true);
    const [complete] = await db.select().from(emiSchedules).where(eq(emiSchedules.id, schedule.id));
    const [paidSale] = await db.select().from(sales).where(eq(sales.id, sale.id));
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    expect(complete?.status).toBe('completed');
    expect(paidSale?.paymentStatus).toBe('paid');
    expect(customer?.outstandingBalance).toBe('0.00');
  });

  it('rolls back purchase return documents when stock is insufficient', async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({ businessId: state.businessId, name: 'Supplier' })
      .returning();
    const [purchase] = await db
      .insert(purchases)
      .values({
        businessId: state.businessId,
        supplierId: supplier!.id,
        supplierName: 'Supplier',
        billNo: randomUUID(),
        subtotal: '90',
        total: '90',
        paymentMethod: 'cash',
      })
      .returning();
    await db.insert(purchaseItems).values({
      purchaseId: purchase!.id,
      productId,
      productName: 'Original product',
      qty: '3',
      unitSymbol: 'pc',
      unitPrice: '30',
      lineTotal: '90',
      gstAmount: '0',
    });
    const result = await createPurchaseReturnAction({
      originalPurchaseId: purchase!.id,
      items: [{ productId, qty: '2' }],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('insufficient stock');
    const rows = await db
      .select()
      .from(purchaseReturns)
      .where(eq(purchaseReturns.originalPurchaseId, purchase!.id));
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(rows).toHaveLength(0);
    expect(product?.inventory).toBe('1.000');
  });

  it('rolls back sale and inventory if two cashiers sell the final unit', async () => {
    const input = {
      storeId,
      paymentMethod: 'cash',
      discount: '0',
      lines: [{ productId, qty: '1' }],
    };
    const results = await Promise.all([createSaleAction(input), createSaleAction(input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.businessId, state.businessId), eq(sales.status, 'completed')));
    expect(product?.inventory).toBe('0.000');
    expect(rows).toHaveLength(1);
  });
});
