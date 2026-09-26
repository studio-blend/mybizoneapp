'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import {
  auditLogs,
  billSeries,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchaseSettlements,
  purchases,
  suppliers,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { round2 } from '@mybizone/domain/money';
import { calculateReturnLines } from '@mybizone/domain/returns';
import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const Input = z
  .object({
    originalPurchaseId: z.string().uuid().optional(),
    originalBillNo: z.string().trim().max(80).optional(),
    supplierId: z.string().uuid().optional(),
    supplierName: z.string().trim().max(120).optional(),
    reason: z.string().trim().max(500).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          qty: z
            .string()
            .regex(/^\d{1,9}(?:\.\d{1,3})?$/)
            .refine((v) => Number(v) > 0, 'quantity must be positive'),
        }),
      )
      .min(1)
      .max(500),
  })
  .refine((v) => !!v.originalPurchaseId || !!v.originalBillNo, 'provide the original bill number');

export const createPurchaseReturnAction = safeAction(Input, async (input, { user, tx }) => {
  // Lock the source document to serialize concurrent partial returns.
  const [original] = await tx
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.businessId, user.businessId),
        input.originalPurchaseId
          ? eq(purchases.id, input.originalPurchaseId)
          : eq(purchases.billNo, input.originalBillNo!),
      ),
    )
    .for('update');
  if (!original) throw new Error('original bill not found');
  await requirePermission(user, 'manage_purchases');
  if (original.paymentMethod === 'credit' && !original.supplierId)
    throw new Error('credit return requires the original supplier and debt reconciliation');
  if (original.paymentMethod === 'credit' && original.supplierId) {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, original.supplierId), eq(suppliers.businessId, user.businessId)))
      .for('update');
    const [settlement] = await tx
      .select({ id: purchaseSettlements.id })
      .from(purchaseSettlements)
      .where(
        and(
          eq(purchaseSettlements.supplierId, original.supplierId),
          eq(purchaseSettlements.businessId, user.businessId),
        ),
      )
      .limit(1);
    if (!supplier || settlement) {
      throw new Error(
        'credit return requires payment allocation reconciliation before adjusting debt',
      );
    }
  }
  if (input.supplierId && input.supplierId !== original.supplierId)
    throw new Error('supplier does not match original bill');
  const sourceItems = await tx
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, original.id));
  const previous = await tx
    .select({
      productId: purchaseReturnItems.productId,
      qty: purchaseReturnItems.qty,
      lineTotal: purchaseReturnItems.lineTotal,
      gstAmount: purchaseReturnItems.gstAmount,
    })
    .from(purchaseReturnItems)
    .innerJoin(purchaseReturns, eq(purchaseReturns.id, purchaseReturnItems.returnId))
    .where(
      and(
        eq(purchaseReturns.originalPurchaseId, original.id),
        eq(purchaseReturns.businessId, user.businessId),
        eq(purchaseReturns.status, 'completed'),
      ),
    );
  const lines = calculateReturnLines(sourceItems, previous, input.items);
  const total = round2(lines.reduce((n, line) => n + Number(line.lineTotal), 0));
  const taxTotal = round2(lines.reduce((n, line) => n + Number(line.gstAmount), 0));
  const fy = financialYear(new Date());
  const [series] = await tx
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
  if (!series) throw new Error('return number assignment failed');
  const returnNo = formatBillNo(series.prefix, fy, series.lastSeq);
  const [row] = await tx
    .insert(purchaseReturns)
    .values({
      businessId: user.businessId,
      originalPurchaseId: original.id,
      supplierId: original.supplierId,
      supplierName: original.supplierName,
      returnNo,
      reason: input.reason || null,
      subtotal: round2(total - taxTotal).toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      total: total.toFixed(2),
      status: 'completed',
    })
    .returning({ id: purchaseReturns.id });
  if (!row) throw new Error('return insert failed');
  for (const line of lines) {
    const source = sourceItems.find((item) => item.productId === line.productId)!;
    await tx.insert(purchaseReturnItems).values({
      returnId: row.id,
      productId: line.productId,
      productName: source.productName,
      qty: line.qty,
      unitSymbol: source.unitSymbol,
      unitPrice: source.unitPrice,
      hsnCode: source.hsnCode,
      gstRate: source.gstRate,
      gstAmount: line.gstAmount,
      lineTotal: line.lineTotal,
    });
    const changed = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} - ${line.qty}::numeric` })
      .where(
        and(
          eq(products.id, line.productId),
          eq(products.businessId, user.businessId),
          gte(products.inventory, line.qty),
        ),
      )
      .returning({ id: products.id });
    if (!changed.length) throw new Error('insufficient stock to return to supplier');
  }
  // Paid bills must not reduce debt from unrelated invoices.
  if (original.paymentMethod === 'credit' && original.supplierId) {
    const adjusted = await tx
      .update(suppliers)
      .set({
        outstandingBalance: sql`${suppliers.outstandingBalance} - ${total.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(suppliers.id, original.supplierId),
          eq(suppliers.businessId, user.businessId),
          gte(suppliers.outstandingBalance, total.toFixed(2)),
        ),
      )
      .returning({ id: suppliers.id });
    if (!adjusted.length)
      throw new Error('credit return exceeds recorded debt; reconcile the balance');
  }
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'purchase_return.create',
    entity: 'purchaseReturn',
    entityId: row.id,
    after: { returnNo, originalBillNo: original.billNo, total: total.toFixed(2) },
  });
  revalidatePath('/purchase-returns');
  revalidatePath('/purchases');
  revalidatePath('/products');
  revalidatePath('/suppliers');
  return { id: row.id, returnNo, total: total.toFixed(2) };
});
