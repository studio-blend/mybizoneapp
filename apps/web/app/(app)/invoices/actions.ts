'use server';

import { packDescription } from '@/lib/pack-policy';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { uploadFile } from '@/lib/storage';
import { auditLogs, billCounters, businesses, invoices, saleItems, sales } from '@mybizone/db';
import { type InvoiceData, renderInvoicePdf } from '@mybizone/pdf/invoice';
import { and, asc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const GenerateInput = z.object({ saleId: z.string().uuid() });

interface GenerateResult {
  invoiceId: string;
  invoiceNo: string;
  pdfKey: string;
}

/**
 * Issue an invoice PDF once; retries return the stored invoice unchanged.
 *
 * 1. Load sale + items + business under tenant scope.
 * 2. Require frozen sale tax facts; unknown legacy context needs reconciliation.
 * 3. Lock the sale and reuse an existing invoice; allocate a number only on first issuance.
 * 4. Use the persisted CGST/SGST/IGST amounts from the sale or existing invoice.
 * 5. Insert the immutable invoice snapshot (1:1 with sale).
 * 6. Render PDF, upload to storage, update invoices.pdf_key.
 *
 * Returns { invoiceId, invoiceNo, pdfKey } — UI links to /api/invoices/[id]/pdf.
 */
export const generateInvoiceAction = safeAction(GenerateInput, async (input, { user, tx }) => {
  const [biz] = await tx
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!biz) {
    throw new Error('business not found');
  }

  const [saleRow] = await tx
    .select({
      id: sales.id,
      storeId: sales.storeId,
      billNo: sales.billNo,
      billType: sales.billType,
      createdAt: sales.createdAt,
      dueDate: sales.dueDate,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      customerGstin: sales.customerGstin,
      subtotal: sales.subtotal,
      discount: sales.discount,
      taxTotal: sales.taxTotal,
      gstEnabledAtSale: sales.gstEnabledAtSale,
      businessGstinAtSale: sales.businessGstinAtSale,
      isInterstate: sales.isInterstate,
      cgst: sales.cgst,
      sgst: sales.sgst,
      igst: sales.igst,
      total: sales.total,
    })
    .from(sales)
    .where(and(eq(sales.id, input.saleId), eq(sales.businessId, user.businessId)))
    .for('update');
  if (!saleRow) {
    throw new Error('sale not found');
  }

  await requirePermission(user, 'view_sales', { storeId: saleRow.storeId });
  if (saleRow.billType === 'estimate') throw new Error('estimates cannot generate invoices');

  // Locking the sale serializes first issuance and retries. Once a PDF exists,
  // serve that immutable document rather than renumbering or changing tax data.
  const [existing] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.saleId, saleRow.id), eq(invoices.businessId, user.businessId)));
  if (existing?.pdfKey) {
    return {
      invoiceId: existing.id,
      invoiceNo: existing.invoiceNo,
      pdfKey: existing.pdfKey,
    } satisfies GenerateResult;
  }

  const items = await tx
    .select({
      productName: saleItems.productName,
      qty: saleItems.qty,
      unitSymbol: saleItems.unitSymbol,
      unitPrice: saleItems.unitPrice,
      packSnapshot: saleItems.packSnapshot,
      hsnCode: saleItems.hsnCode,
      gstRate: saleItems.gstRate,
      gstAmount: saleItems.gstAmount,
      lineTotal: saleItems.lineTotal,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleRow.id))
    .orderBy(asc(saleItems.createdAt));

  if (
    !existing &&
    (saleRow.gstEnabledAtSale === null ||
      saleRow.isInterstate === null ||
      saleRow.cgst === null ||
      saleRow.sgst === null ||
      saleRow.igst === null)
  ) {
    throw new Error(
      'Historical sale tax context is missing; reconcile its original tax details before issuing an invoice',
    );
  }
  const interstate = existing?.isInterstate ?? saleRow.isInterstate ?? false;
  const cgst = Number(existing?.cgst ?? saleRow.cgst);
  const sgst = Number(existing?.sgst ?? saleRow.sgst);
  const igst = Number(existing?.igst ?? saleRow.igst);

  let inv = existing;
  if (!inv) {
    const [counter] = await tx
      .insert(billCounters)
      .values({ businessId: user.businessId, lastInvoiceNo: 1 })
      .onConflictDoUpdate({
        target: billCounters.businessId,
        set: { lastInvoiceNo: sql`${billCounters.lastInvoiceNo} + 1` },
      })
      .returning({ lastInvoiceNo: billCounters.lastInvoiceNo });
    if (!counter) throw new Error('invoice numbering failed');
    const invoiceNo = `INV-${String(counter.lastInvoiceNo).padStart(6, '0')}`;
    [inv] = await tx
      .insert(invoices)
      .values({
        businessId: user.businessId,
        saleId: saleRow.id,
        invoiceNo,
        businessGstin: saleRow.businessGstinAtSale,
        customerGstin: saleRow.customerGstin,
        customerName: saleRow.customerName,
        isInterstate: interstate,
        subtotal: saleRow.subtotal,
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        igst: igst.toFixed(2),
        total: saleRow.total,
      })
      .returning();
    if (!inv) throw new Error('invoice persist failed');
  }

  const data: InvoiceData = {
    isGstInvoice:
      saleRow.gstEnabledAtSale ??
      (saleRow.billType === 'gst_bill' && (!!inv.businessGstin || cgst + sgst + igst > 0)),
    business: { name: biz.name, gstin: inv.businessGstin },
    invoice: {
      number: inv.invoiceNo,
      date: new Date(saleRow.createdAt),
      dueDate: saleRow.dueDate,
      isInterstate: interstate,
    },
    customer: {
      name: inv.customerName,
      phone: saleRow.customerPhone,
      gstin: inv.customerGstin,
      address: null,
    },
    lines: items.map((i) => ({
      productName: i.productName,
      hsnCode: i.hsnCode,
      qty: i.qty,
      unitSymbol: i.unitSymbol,
      unitPrice: i.unitPrice,
      packDescription: packDescription(i.packSnapshot) || undefined,
      gstRate: i.gstRate,
      gstAmount: i.gstAmount,
      lineTotal: i.lineTotal,
    })),
    totals: {
      subtotal: inv.subtotal,
      discount: saleRow.discount,
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      total: inv.total,
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
