'use server';

import { safeAction } from '@/lib/server-action';
import { uploadFile } from '@/lib/storage';
import { auditLogs, billCounters, businesses, invoices, saleItems, sales } from '@mybizone/db';
import { isInterstate } from '@mybizone/domain/gst';
import { type InvoiceData, renderInvoicePdf } from '@mybizone/pdf/invoice';
import { and, asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const GenerateInput = z.object({ saleId: z.string().uuid() });

interface GenerateResult {
  invoiceId: string;
  invoiceNo: string;
  pdfKey: string;
}

/**
 * Generate (or regenerate) the invoice PDF for an existing sale.
 *
 * 1. Load sale + items + business under tenant scope.
 * 2. Decide intra/interstate via stored customer GSTIN where available,
 *    falling back to false (intrastate) when no GSTIN — owners can re-toggle
 *    by editing the sale's customer GSTIN if needed (M3 polish).
 * 3. Allocate invoice_no atomically via bill_counters.
 * 4. Recompute the GST split from the snapshotted sale_items so historical
 *    invoices stay correct even if products are later edited.
 * 5. UPSERT the invoices row (1:1 with sale).
 * 6. Render PDF, upload to storage, update invoices.pdf_key.
 *
 * Returns { invoiceId, invoiceNo, pdfKey } — UI links to /api/invoices/[id]/pdf.
 */
export const generateInvoiceAction = safeAction(GenerateInput, async (input, { user, tx }) => {
  const [biz] = await tx
    .select({ name: businesses.name, gstin: businesses.gstin, gstEnabled: businesses.gstEnabled })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!biz) {
    throw new Error('business not found');
  }

  const [saleRow] = await tx
    .select({
      id: sales.id,
      billNo: sales.billNo,
      createdAt: sales.createdAt,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      customerGstin: sales.customerGstin,
      subtotal: sales.subtotal,
      discount: sales.discount,
      taxTotal: sales.taxTotal,
      total: sales.total,
    })
    .from(sales)
    .where(and(eq(sales.id, input.saleId), eq(sales.businessId, user.businessId)));
  if (!saleRow) {
    throw new Error('sale not found');
  }

  const items = await tx
    .select({
      productName: saleItems.productName,
      qty: saleItems.qty,
      unitSymbol: saleItems.unitSymbol,
      unitPrice: saleItems.unitPrice,
      hsnCode: saleItems.hsnCode,
      gstRate: saleItems.gstRate,
      gstAmount: saleItems.gstAmount,
      lineTotal: saleItems.lineTotal,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleRow.id))
    .orderBy(asc(saleItems.createdAt));

  const interstate = isInterstate(biz.gstin, saleRow.customerGstin) ?? false;
  const taxTotalNum = Number(saleRow.taxTotal);
  const cgst = !interstate && taxTotalNum > 0 ? roundHalf(taxTotalNum) : 0;
  const sgst = !interstate && taxTotalNum > 0 ? +(taxTotalNum - cgst).toFixed(2) : 0;
  const igst = interstate ? taxTotalNum : 0;

  // Allocate invoice_no atomically.
  const [counter] = await tx
    .insert(billCounters)
    .values({ businessId: user.businessId, lastInvoiceNo: 1 })
    .onConflictDoUpdate({
      target: billCounters.businessId,
      set: { lastInvoiceNo: sql`${billCounters.lastInvoiceNo} + 1` },
    })
    .returning({ lastInvoiceNo: billCounters.lastInvoiceNo });
  if (!counter) {
    throw new Error('invoice numbering failed');
  }
  const invoiceNo = `INV-${String(counter.lastInvoiceNo).padStart(6, '0')}`;

  // UPSERT invoice row keyed on sale_id (unique). Re-generation overwrites.
  const [inv] = await tx
    .insert(invoices)
    .values({
      businessId: user.businessId,
      saleId: saleRow.id,
      invoiceNo,
      businessGstin: biz.gstin,
      customerGstin: saleRow.customerGstin,
      customerName: saleRow.customerName,
      isInterstate: interstate,
      subtotal: saleRow.subtotal,
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      total: saleRow.total,
    })
    .onConflictDoUpdate({
      target: invoices.saleId,
      set: {
        invoiceNo,
        businessGstin: biz.gstin,
        customerGstin: saleRow.customerGstin,
        customerName: saleRow.customerName,
        isInterstate: interstate,
        subtotal: saleRow.subtotal,
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: igst.toFixed(2),
        total: saleRow.total,
      },
    })
    .returning({ id: invoices.id, invoiceNo: invoices.invoiceNo });
  if (!inv) {
    throw new Error('invoice persist failed');
  }

  const data: InvoiceData = {
    isGstInvoice: biz.gstEnabled,
    business: { name: biz.name, gstin: biz.gstin },
    invoice: {
      number: inv.invoiceNo,
      date: new Date(saleRow.createdAt),
      isInterstate: interstate,
    },
    customer: {
      name: saleRow.customerName,
      phone: saleRow.customerPhone,
      gstin: saleRow.customerGstin,
      address: null,
    },
    lines: items.map((i) => ({
      productName: i.productName,
      hsnCode: i.hsnCode,
      qty: i.qty,
      unitSymbol: i.unitSymbol,
      unitPrice: i.unitPrice,
      gstRate: i.gstRate,
      gstAmount: i.gstAmount,
      lineTotal: i.lineTotal,
    })),
    totals: {
      subtotal: saleRow.subtotal,
      discount: saleRow.discount,
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      total: saleRow.total,
    },
  };

  const buf = await renderInvoicePdf(data);
  const upload = await uploadFile({
    category: 'invoices',
    businessId: user.businessId,
    body: buf,
    allowed: ['application/pdf'],
  });
  const pdfKey = upload.key;

  await tx
    .update(invoices)
    .set({ pdfKey })
    .where(and(eq(invoices.id, inv.id), eq(invoices.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'invoice.generate',
    entity: 'invoice',
    entityId: inv.id,
    after: { invoiceNo: inv.invoiceNo },
  });

  revalidatePath(`/sales/${saleRow.id}`);
  return { invoiceId: inv.id, invoiceNo: inv.invoiceNo, pdfKey } satisfies GenerateResult;
});

function roundHalf(amount: number): number {
  // Half of GST, rounded to 2 decimal places.
  return Math.round((amount / 2 + Number.EPSILON) * 100) / 100;
}
