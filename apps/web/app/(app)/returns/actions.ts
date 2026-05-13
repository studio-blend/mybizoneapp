'use server';

import { db } from '@/lib/db';
import { safeAction } from '@/lib/server-action';
import {
  auditLogs,
  billSeries,
  customers,
  products,
  returnItems,
  salesReturns,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
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

const CreateSalesReturnInput = z.object({
  originalSaleId: uuid.optional(),
  customerId: uuid.optional(),
  customerName: optionalText(120),
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

interface CreateSalesReturnResult {
  id: string;
  returnNo: string;
  total: string;
}

export const createSalesReturnAction = safeAction(
  CreateSalesReturnInput,
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

    for (const item of input.items) {
      const p = byId.get(item.productId);
      if (!p) throw new Error(`product ${item.productId} not found`);
      if (!p.active) throw new Error(`product "${p.name}" is deleted`);
    }

    // 2. Compute line totals (qty × unitPrice, no GST recalc for returns).
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

    // 3. Generate return number via bill_series (atomic, FY-aware).
    const now = new Date();
    const fy = financialYear(now);
    const [seriesRow] = await tx
      .insert(billSeries)
      .values({
        businessId: user.businessId,
        docType: 'return',
        financialYear: fy,
        prefix: 'RET',
        lastSeq: 1,
      })
      .onConflictDoUpdate({
        target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
        set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
      })
      .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
    if (!seriesRow) throw new Error('bill series assignment failed');
    const returnNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);

    // 4. Insert salesReturns row.
    const [returnRow] = await tx
      .insert(salesReturns)
      .values({
        businessId: user.businessId,
        originalSaleId: input.originalSaleId ?? null,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        returnNo,
        reason: input.reason,
        subtotal: subtotal.toFixed(2),
        taxTotal: '0.00',
        total: total.toFixed(2),
        status: 'completed',
      })
      .returning({ id: salesReturns.id });
    if (!returnRow) throw new Error('sales return insert failed');

    // 5. Insert returnItems + restock inventory for each line.
    for (const line of lines) {
      await tx.insert(returnItems).values({
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
        costPriceAtSale: line.product.costPrice,
      });

      // 6. Restock inventory (increment — no floor check needed on returns).
      await tx
        .update(products)
        .set({ inventory: sql`${products.inventory} + ${line.qty}` })
        .where(
          and(eq(products.id, line.productId), eq(products.businessId, user.businessId)),
        );
    }

    // 7. If customerId provided: credit customer's outstanding balance (refund).
    if (input.customerId) {
      await tx
        .update(customers)
        .set({
          outstandingBalance: sql`GREATEST(0, ${customers.outstandingBalance} - ${total.toFixed(2)})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customers.id, input.customerId),
            eq(customers.businessId, user.businessId),
          ),
        );
    }

    // 8. Audit log.
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'return.create',
      entity: 'salesReturn',
      entityId: returnRow.id,
      after: { returnNo, total: total.toFixed(2) },
    });

    // 9. Revalidate affected paths.
    revalidatePath('/returns');
    revalidatePath('/sales');
    revalidatePath('/products');

    return {
      id: returnRow.id,
      returnNo,
      total: total.toFixed(2),
    } satisfies CreateSalesReturnResult;
  },
);
