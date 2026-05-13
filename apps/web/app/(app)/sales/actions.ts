'use server';

import { db } from '@/lib/db';
import { type ActionResult, safeAction } from '@/lib/server-action';
import { requireUser } from '@/lib/session';
import { uploadFile } from '@/lib/storage';
import {
  auditLogs,
  billSeries,
  businesses,
  customers,
  emiPayments,
  emiSchedules,
  products,
  saleItems,
  sales,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { calculateSaleTotals } from '@mybizone/domain/sale';
import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp');

// M8: expanded payment method universe. card_debit/card_credit separated for reporting;
// finance_emi triggers EMI schedule generation; cheque/credit are settle-later flows.
const PAYMENT_METHODS = [
  'cash',
  'upi',
  'card_debit',
  'card_credit',
  'finance_emi',
  'cheque',
  'credit',
  'other',
] as const;
const BILL_TYPES = ['gst_bill', 'non_gst_bill', 'estimate'] as const;
const PAYMENT_STATUSES = ['paid', 'partial', 'due', 'overdue'] as const;

const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

const SaleLineInput = z.object({
  productId: uuid,
  qty: qtyText,
  // M8: per-line ₹ discount and free flag.
  itemDiscount: z.union([z.literal(''), moneyText]).optional().default('0').transform((v) => (v === '' ? '0' : (v ?? '0'))),
  isFreeItem: z.boolean().optional().default(false),
});

const CreateSaleInput = z.object({
  storeId: uuid,
  customerId: optionalUuid.optional().default(''),
  customerName: optionalText(120),
  customerPhone: optionalText(30),
  customerGstin: optionalText(20),
  paymentMethod: z.enum(PAYMENT_METHODS),
  discount: z.union([z.literal(''), moneyText]).transform((v) => (v === '' ? '0' : v)),
  notes: optionalText(500),
  isInterstate: z.boolean().default(false),
  // M8: bill type controls inventory/series behaviour.
  billType: z.enum(BILL_TYPES).default('gst_bill'),
  // M8: JSONB blob with payment-method-specific fields (UPI ref, card last4, EMI info, cheque no.).
  paymentDetails: z.record(z.unknown()).optional(),
  // M8: payment_status — 'paid' for cash/upi/card; 'due'/'partial' for credit/EMI.
  paymentStatus: z.enum(PAYMENT_STATUSES).default('paid'),
  // M8: due date for estimates + EMI; YYYY-MM-DD or empty.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  lines: z.array(SaleLineInput).min(1, 'add at least one product'),
});

interface CreateSaleResult {
  id: string;
  billNo: string;
  total: string;
}

/**
 * Create a sale atomically. The transaction:
 *   1. UPSERTs bill_counters → atomic sale_no per business.
 *   2. Loads each cart product (snapshot price/unit/gst at sale time).
 *   3. Computes totals via the pure domain calculator.
 *   4. Inserts sales + sale_items.
 *   5. Decrements products.inventory with a floor check in the same UPDATE
 *      (`WHERE inventory >= qty`) — zero rows updated → throw InsufficientStock.
 *   6. Writes an audit_log.
 *
 * M8 changes:
 *   - billType='estimate' SKIPS inventory decrement AND bill_series UPSERT —
 *     a synthetic 'EST-<fy>-<timestamp>' bill_no is used so the unique
 *     constraint still holds without burning a serial number.
 *   - paymentMethod='finance_emi' creates an emi_schedules row + N emi_payments
 *     rows (one per instalment) in the same transaction.
 *
 * Either every step persists or none does — no partial inventory drift.
 */
export const createSaleAction = safeAction(CreateSaleInput, async (input, { user, tx }) => {
  // Snapshot product rows — RLS already scopes to tenant, store check verifies the cart's store.
  const productRows = await tx
    .select({
      id: products.id,
      storeId: products.storeId,
      name: products.name,
      unitSymbol: products.unitSymbol,
      price: products.price,
      costPrice: products.costPrice,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      active: products.active,
    })
    .from(products)
    .where(eq(products.businessId, user.businessId));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  for (const l of input.lines) {
    const p = byId.get(l.productId);
    if (!p) throw new Error(`product ${l.productId} not found`);
    if (!p.active) throw new Error(`product "${p.name}" is deleted`);
    if (p.storeId !== input.storeId) {
      throw new Error(`product "${p.name}" does not belong to selected store`);
    }
  }

  // Read business GST settings (also snapshot for invoice gen later).
  const [biz] = await tx
    .select({ gstEnabled: businesses.gstEnabled, gstin: businesses.gstin })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!biz) throw new Error('business not found');

  // M8: estimates and non-GST bills both force GST OFF for the calculator,
  // regardless of business setting.
  const effectiveGstEnabled = biz.gstEnabled && input.billType !== 'non_gst_bill';

  const calc = calculateSaleTotals({
    gstEnabled: effectiveGstEnabled,
    isInterstate: input.isInterstate,
    discount: Number(input.discount),
    lines: input.lines.map((l) => {
      const p = byId.get(l.productId);
      if (!p) throw new Error('unreachable');
      return {
        qty: Number(l.qty),
        unitPrice: Number(p.price),
        gstRate: p.gstRate ? Number(p.gstRate) : null,
        itemDiscount: Number(l.itemDiscount ?? '0'),
        isFreeItem: l.isFreeItem ?? false,
      };
    }),
  });

  // Atomic FY-aware bill number via bill_series table.
  // M8: estimates use 'EST' prefix + a synthetic suffix and DO NOT burn a series number —
  // they aren't legal invoices and shouldn't be counted as such for GST audits.
  const now = new Date();
  const fy = financialYear(now);
  let billNo: string;
  if (input.billType === 'estimate') {
    // Synthetic unique id; uniqueness already enforced by sales_business_bill_no_unique.
    billNo = `EST-${fy.split('-').map((s) => s.slice(-2)).join('-')}-${Date.now().toString().slice(-8)}`;
  } else {
    const prefix = input.billType === 'non_gst_bill' ? 'BILL' : 'GST';
    const [seriesRow] = await tx
      .insert(billSeries)
      .values({ businessId: user.businessId, docType: 'sale', financialYear: fy, prefix, lastSeq: 1 })
      .onConflictDoUpdate({
        target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
        set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
      })
      .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
    if (!seriesRow) throw new Error('bill series assignment failed');
    billNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);
  }

  // Insert sale row.
  const [saleRow] = await tx
    .insert(sales)
    .values({
      businessId: user.businessId,
      storeId: input.storeId,
      employeeId: user.id,
      billNo,
      financialYear: fy,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerGstin: input.customerGstin,
      subtotal: calc.subtotal.toFixed(2),
      discount: calc.discount.toFixed(2),
      taxTotal: calc.taxTotal.toFixed(2),
      total: calc.total.toFixed(2),
      paymentMethod: input.paymentMethod,
      paymentDetails: input.paymentDetails ?? null,
      billType: input.billType,
      paymentStatus: input.paymentStatus,
      dueDate: input.dueDate ?? null,
      notes: input.notes,
    })
    .returning({ id: sales.id });
  if (!saleRow) throw new Error('sale insert failed');

  // Insert sale_items + decrement inventory atomically with floor check.
  // M8: estimates skip the decrement entirely.
  const skipInventory = input.billType === 'estimate';
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const calcLine = calc.lines[i];
    if (!l || !calcLine) throw new Error('calc/line mismatch');
    const p = byId.get(l.productId);
    if (!p) throw new Error('unreachable');

    await tx.insert(saleItems).values({
      businessId: user.businessId,
      saleId: saleRow.id,
      productId: p.id,
      productName: p.name,
      qty: l.qty,
      unitSymbol: p.unitSymbol,
      unitPrice: p.price,
      hsnCode: p.hsnCode,
      gstRate: p.gstRate,
      lineTotal: calcLine.lineTotal.toFixed(2),
      gstAmount: calcLine.gstAmount.toFixed(2),
      costPriceAtSale: p.costPrice,
      itemDiscount: (l.itemDiscount ?? '0').toString(),
      isFreeItem: l.isFreeItem ?? false,
      freeQty: (l.isFreeItem ?? false) ? l.qty : null,
    });

    if (skipInventory) continue;

    const decrement = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} - ${l.qty}` })
      .where(
        and(
          eq(products.id, p.id),
          eq(products.businessId, user.businessId),
          gte(products.inventory, l.qty),
        ),
      )
      .returning({ id: products.id });
    if (decrement.length === 0) {
      throw new Error(`insufficient stock for "${p.name}"`);
    }
  }

  // Credit / finance_emi sale: increment customer outstanding balance.
  // Estimates never affect outstanding (they aren't real bills).
  const updatesOutstanding =
    input.billType !== 'estimate' &&
    (input.paymentMethod === 'credit' || input.paymentMethod === 'finance_emi') &&
    !!input.customerId;
  if (updatesOutstanding && input.customerId) {
    await tx
      .update(customers)
      .set({
        outstandingBalance: sql`${customers.outstandingBalance} + ${calc.total.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
  }

  // M8: finance_emi generates an emi_schedules row + N emi_payments (one per instalment).
  // The finance company / tenure / EMI amount come in via paymentDetails from the POS form.
  if (input.paymentMethod === 'finance_emi' && input.billType !== 'estimate') {
    const pd = input.paymentDetails ?? {};
    const financeCompany = typeof pd.financeCompany === 'string' ? pd.financeCompany.trim() : '';
    if (!financeCompany) throw new Error('finance_emi requires paymentDetails.financeCompany');
    const tenureMonths = Math.max(1, Math.floor(Number(pd.tenureMonths ?? 0) || 0));
    if (tenureMonths < 1) throw new Error('finance_emi requires tenureMonths >= 1');
    const emiAmountRaw = Number(pd.emiAmount ?? 0);
    if (!Number.isFinite(emiAmountRaw) || emiAmountRaw <= 0) {
      throw new Error('finance_emi requires positive emiAmount');
    }
    const downPaymentRaw = Number(pd.downPayment ?? 0) || 0;
    const startDate = input.dueDate ?? new Date().toISOString().slice(0, 10);

    const [schedule] = await tx
      .insert(emiSchedules)
      .values({
        businessId: user.businessId,
        saleId: saleRow.id,
        customerId: input.customerId ?? null,
        financeCompany,
        principalAmount: calc.total.toFixed(2),
        downPayment: downPaymentRaw.toFixed(2),
        tenureMonths,
        emiAmount: emiAmountRaw.toFixed(2),
        startDate,
        status: 'active',
      })
      .returning({ id: emiSchedules.id });
    if (!schedule) throw new Error('emi schedule insert failed');

    // Generate one row per instalment with month-stepped due dates.
    const base = new Date(`${startDate}T00:00:00Z`);
    const rows = Array.from({ length: tenureMonths }, (_, idx) => {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() + idx + 1);
      return {
        businessId: user.businessId,
        emiScheduleId: schedule.id,
        instalmentNumber: idx + 1,
        dueDate: d.toISOString().slice(0, 10),
        status: 'pending',
      };
    });
    await tx.insert(emiPayments).values(rows);
  }

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'sale.create',
    entity: 'sale',
    entityId: saleRow.id,
    after: {
      billNo,
      total: calc.total,
      paymentMethod: input.paymentMethod,
      billType: input.billType,
    },
  });

  revalidatePath('/sales');
  revalidatePath('/dashboard');
  if (updatesOutstanding) revalidatePath('/customers');
  if (input.paymentMethod === 'finance_emi') revalidatePath('/emi');
  if (input.paymentStatus !== 'paid') revalidatePath('/reports/due-bills');
  return { id: saleRow.id, billNo, total: calc.total.toFixed(2) } satisfies CreateSaleResult;
});

/**
 * Optional bill-image upload for the proof-of-physical-bill workflow. Same
 * pattern as product images: takes raw FormData because Server Action JSON
 * pipes can't carry binary.
 */
export async function uploadSaleBillImageAction(
  formData: FormData,
): Promise<ActionResult<{ key: string }>> {
  const user = await requireUser();
  const idValue = formData.get('id');
  const fileValue = formData.get('file');
  if (typeof idValue !== 'string' || !/^[0-9a-f-]{36}$/i.test(idValue)) {
    return { ok: false, error: 'invalid sale id' };
  }
  if (!(fileValue instanceof Blob) || fileValue.size === 0) {
    return { ok: false, error: 'no file selected' };
  }

  const buf = Buffer.from(await fileValue.arrayBuffer());
  let key: string;
  try {
    const out = await uploadFile({
      category: 'bills',
      businessId: user.businessId,
      body: buf,
      allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    });
    key = out.key;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'upload failed' };
  }

  await withTenant(db, user.businessId, async (tx) => {
    await tx
      .update(sales)
      .set({ billImageKey: key, updatedAt: new Date() })
      .where(and(eq(sales.id, idValue), eq(sales.businessId, user.businessId)));
  });

  revalidatePath('/sales');
  return { ok: true, data: { key } };
}
