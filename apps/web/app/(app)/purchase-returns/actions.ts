'use server';

import { safeAction } from '@/lib/server-action';
import {
  auditLogs,
  billSeries,
  products,
  purchaseReturnItems,
  purchaseReturns,
  suppliers,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);

const CreatePurchaseReturnInput = z.object({
  originalPurchaseId: uuid.optional(),
  supplierId: uuid.optional(),
  supplierName: optionalText(120),
  reason: optionalText(500),
  items: z
    .array(
      z.object({
        productId: uuid,
        qty: z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp'),
      }),
    )
    .min(1, 'add at least one item to return'),
});

interface CreatePurchaseReturnResult {
  id: string;
  returnNo: string;
  total: string;
}

export const createPurchaseReturnAction = safeAction(
  CreatePurchaseReturnInput,
  async (input, { user, tx }) => {
    // 1. Snapshot product rows for returned items.
    const productRows = await tx
      .select({
        id: products.id,
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

    // 2. Validate each item exists and is active.
    for (const item of input.items) {
      const p = byId.get(item.productId);
      if (!p) throw new Error(`product ${item.productId} not found`);
      if (!p.active) throw new Error(`product "${p.name}" is deleted`);
    }

    // 3. Compute line totals (qty × price).
    type LineCalc = {
      productId: string;
      qty: string;
      product: (typeof productRows)[number];
      lineTotal: string;
    };

    const lines: LineCalc[] = input.items.map((item) => {
      const p = byId.get(item.productId);
      if (!p) throw new Error('unreachable');
      const lineTotal = (Number(item.qty) * Number(p.price)).toFixed(2);
      return { productId: item.productId, qty: item.qty, product: p, lineTotal };
    });

    const subtotal = lines.reduce((acc, l) => acc + Number(l.lineTotal), 0);
    const total = subtotal; // No GST recalc for returns; taxTotal = 0.

    // 4. Generate return number via bill_series (atomic, FY-aware).
    const now = new Date();
    const fy = financialYear(now);
    const [seriesRow] = await tx
      .insert(billSeries)
      .values({
        businessId: user.businessId,
        docType: 'purchase_return',
        financialYear: fy,
        prefix: 'PR',
        lastSeq: 1,
      })
      .onConflictDoUpdate({
        target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
        set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
      })
      .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
    if (!seriesRow) throw new Error('bill series assignment failed');
    const returnNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);

    // 5. Insert purchaseReturns row.
    const [returnRow] = await tx
      .insert(purchaseReturns)
      .values({
        businessId: user.businessId,
        originalPurchaseId: input.originalPurchaseId ?? null,
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? '',
        returnNo,
        reason: input.reason,
        subtotal: subtotal.toFixed(2),
        taxTotal: '0.00',
        total: total.toFixed(2),
        status: 'completed',
      })
      .returning({ id: purchaseReturns.id });
    if (!returnRow) throw new Error('purchase return insert failed');

    // 6. Insert purchaseReturnItems + decrement inventory for each line.
    for (const line of lines) {
      await tx.insert(purchaseReturnItems).values({
        returnId: returnRow.id,
        productId: line.productId,
        productName: line.product.name,
        qty: line.qty,
        unitSymbol: line.product.unitSymbol,
        unitPrice: line.product.price,
        hsnCode: line.product.hsnCode,
        gstRate: line.product.gstRate,
        gstAmount: '0.00',
        lineTotal: line.lineTotal,
      });

      // 7. Decrement inventory — no floor check: goods genuinely left the shop.
      await tx
        .update(products)
        .set({ inventory: sql`${products.inventory} - ${line.qty}` })
        .where(
          and(eq(products.id, line.productId), eq(products.businessId, user.businessId)),
        );
    }

    // 8. If supplierId provided: reduce outstanding balance (we owe them less).
    if (input.supplierId) {
      await tx
        .update(suppliers)
        .set({
          outstandingBalance: sql`GREATEST(0, ${suppliers.outstandingBalance} - ${total.toFixed(2)}::numeric)`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)),
        );
    }

    // 9. Audit log.
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'purchase_return.create',
      entity: 'purchaseReturn',
      entityId: returnRow.id,
      after: { returnNo, total: total.toFixed(2) },
    });

    // 10. Revalidate affected paths.
    revalidatePath('/purchase-returns');
    revalidatePath('/products');
    if (input.supplierId) {
      revalidatePath('/suppliers');
    }

    return {
      id: returnRow.id,
      returnNo,
      total: total.toFixed(2),
    } satisfies CreatePurchaseReturnResult;
  },
);
