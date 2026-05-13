'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, billSeries, products, quotationItems, quotations } from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp');

const QUOTATION_STATUSES = ['sent', 'accepted', 'rejected', 'expired'] as const;

const QuotationLineInput = z.object({
  productId: uuid,
  qty: qtyText,
  unitPrice: moneyText,
});

const CreateQuotationInput = z.object({
  customerId: optionalUuid.optional().default(''),
  customerName: optionalText(120),
  customerPhone: optionalText(30),
  notes: optionalText(500),
  validUntil: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  items: z.array(QuotationLineInput).min(1, 'add at least one item'),
});

export const createQuotationAction = safeAction(
  CreateQuotationInput,
  async (input, { user, tx }) => {
    // 1. Generate quoteNo via bill_series (docType='quotation', prefix='QT')
    const now = new Date();
    const fy = financialYear(now);
    const [seriesRow] = await tx
      .insert(billSeries)
      .values({
        businessId: user.businessId,
        docType: 'quotation',
        financialYear: fy,
        prefix: 'QT',
        lastSeq: 1,
      })
      .onConflictDoUpdate({
        target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
        set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
      })
      .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
    if (!seriesRow) throw new Error('bill series assignment failed');
    const quoteNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);

    // 2. Snapshot product details for each item
    const productRows = await tx
      .select({
        id: products.id,
        name: products.name,
        unitSymbol: products.unitSymbol,
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        active: products.active,
      })
      .from(products)
      .where(eq(products.businessId, user.businessId));
    const byId = new Map(productRows.map((p) => [p.id, p]));

    for (const item of input.items) {
      const p = byId.get(item.productId);
      if (!p) throw new Error(`product ${item.productId} not found`);
      if (!p.active) throw new Error(`product "${p.name}" is deleted`);
    }

    // 3. Compute subtotal + total (simple sum of lineTotals, no GST recalc for quotes)
    let subtotal = 0;
    const computedLines = input.items.map((item) => {
      const lineTotal = Number(item.qty) * Number(item.unitPrice);
      subtotal += lineTotal;
      return { ...item, lineTotal };
    });
    const total = subtotal;

    // 4. Insert quotations row
    const [quoteRow] = await tx
      .insert(quotations)
      .values({
        businessId: user.businessId,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        quoteNo,
        status: 'draft',
        validUntil: input.validUntil,
        subtotal: subtotal.toFixed(2),
        discount: '0',
        taxTotal: '0',
        total: total.toFixed(2),
        notes: input.notes,
      })
      .returning({ id: quotations.id });
    if (!quoteRow) throw new Error('quotation insert failed');

    // Insert quotation items
    for (const line of computedLines) {
      const p = byId.get(line.productId);
      if (!p) throw new Error('unreachable');
      await tx.insert(quotationItems).values({
        quotationId: quoteRow.id,
        productId: line.productId,
        productName: p.name,
        qty: line.qty,
        unitSymbol: p.unitSymbol,
        unitPrice: line.unitPrice,
        hsnCode: p.hsnCode,
        gstRate: p.gstRate,
        gstAmount: '0',
        lineTotal: line.lineTotal.toFixed(2),
      });
    }

    // 5. Audit log
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'quotation.create',
      entity: 'quotation',
      entityId: quoteRow.id,
      after: { quoteNo, total: total.toFixed(2) },
    });

    // 6. Revalidate
    revalidatePath('/quotations');

    return { id: quoteRow.id, quoteNo };
  },
);

const UpdateQuotationStatusInput = z.object({
  id: uuid,
  status: z.enum(QUOTATION_STATUSES),
});

export const updateQuotationStatusAction = safeAction(
  UpdateQuotationStatusInput,
  async (input, { user, tx }) => {
    const [row] = await tx
      .update(quotations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(quotations.id, input.id), eq(quotations.businessId, user.businessId)))
      .returning({ id: quotations.id });
    if (!row) throw new Error('quotation not found');

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'quotation.status_update',
      entity: 'quotation',
      entityId: input.id,
      after: { status: input.status },
    });

    revalidatePath('/quotations');
    return { ok: true };
  },
);
