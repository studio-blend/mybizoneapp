'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { moveStockBatches } from '@/lib/stock-batches';
import {
  auditLogs,
  billSeries,
  customers,
  products,
  returnItems,
  saleItems,
  sales,
  salesReturns,
  salesSettlements,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { round2 } from '@mybizone/domain/money';
import { calculateReturnLines } from '@mybizone/domain/returns';
import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const Input = z
  .object({
    originalSaleId: z.string().uuid().optional(),
    originalBillNo: z.string().trim().max(80).optional(),
    customerId: z.string().uuid().optional(),
    customerName: z.string().trim().max(120).optional(),
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
  .refine((v) => !!v.originalSaleId || !!v.originalBillNo, 'provide the original bill number');

export const createSalesReturnAction = safeAction(Input, async (input, { user, tx }) => {
  // Lock the source document to serialize concurrent partial returns.
  const [original] = await tx
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.businessId, user.businessId),
        input.originalSaleId
          ? eq(sales.id, input.originalSaleId)
          : eq(sales.billNo, input.originalBillNo!),
      ),
    )
    .for('update');
  if (!original) throw new Error('original bill not found');
  await requirePermission(user, 'create_sale', { storeId: original.storeId });
  if (original.customerId) await requirePermission(user, 'create_sale');
  if (original.paymentMethod === 'finance_emi')
    throw new Error('close or adjust the finance agreement before returning an EMI bill');
  if (original.billType === 'estimate') throw new Error('estimates cannot be returned');
  if (original.status !== 'completed') throw new Error('only completed sales can be returned');
  if (original.paymentMethod === 'credit' && !original.customerId)
    throw new Error('credit return requires the original customer and debt reconciliation');
  if (original.paymentMethod === 'credit' && original.customerId) {
    // Same party lock as settlement: the check and debt reduction must serialize.
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, original.customerId), eq(customers.businessId, user.businessId)))
      .for('update');
    const [settlement] = await tx
      .select({ id: salesSettlements.id })
      .from(salesSettlements)
      .where(
        and(
          eq(salesSettlements.customerId, original.customerId),
          eq(salesSettlements.businessId, user.businessId),
        ),
      )
      .limit(1);
    if (!customer || settlement || original.paymentStatus !== 'due') {
      throw new Error(
        'credit return requires payment allocation reconciliation before adjusting debt',
      );
    }
  }
  if (input.customerId && input.customerId !== original.customerId)
    throw new Error('customer does not match original bill');
  const sourceItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, original.id));
  const previous = await tx
    .select({
      productId: returnItems.productId,
      qty: returnItems.qty,
      lineTotal: returnItems.lineTotal,
      gstAmount: returnItems.gstAmount,
    })
    .from(returnItems)
    .innerJoin(salesReturns, eq(salesReturns.id, returnItems.returnId))
    .where(
      and(
        eq(salesReturns.originalSaleId, original.id),
        eq(salesReturns.businessId, user.businessId),
        eq(salesReturns.status, 'completed'),
      ),
    );
  const lines = calculateReturnLines(sourceItems, previous, input.items);
  for (const line of lines) {
    const costs = new Set(
      sourceItems
        .filter((item) => item.productId === line.productId)
        .map((item) => item.costPriceAtSale),
    );
    if (costs.size > 1) throw new Error('return requires original-line cost reconciliation');
  }
  const total = round2(lines.reduce((n, line) => n + Number(line.lineTotal), 0));
  const taxTotal = round2(lines.reduce((n, line) => n + Number(line.gstAmount), 0));
  const fy = financialYear(new Date());
  const [series] = await tx
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
  if (!series) throw new Error('return number assignment failed');
  const returnNo = formatBillNo(series.prefix, fy, series.lastSeq);
  const [row] = await tx
    .insert(salesReturns)
    .values({
      businessId: user.businessId,
      originalSaleId: original.id,
      customerId: original.customerId,
      customerName: original.customerName,
      returnNo,
      reason: input.reason || null,
      subtotal: round2(total - taxTotal).toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      total: total.toFixed(2),
      status: 'completed',
    })
    .returning({ id: salesReturns.id });
  if (!row) throw new Error('return insert failed');
  for (const line of lines) {
    const source = sourceItems.find((item) => item.productId === line.productId)!;
    await tx.insert(returnItems).values({
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
      costPriceAtSale: source.costPriceAtSale,
    });
    const changed = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} + ${line.qty}::numeric` })
      .where(and(eq(products.id, line.productId), eq(products.businessId, user.businessId)))
      .returning({ id: products.id });
    if (!changed.length) throw new Error('returned product no longer exists');
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: line.productId,
      qty: line.qty,
      kind: 'sales_return',
      documentId: row.id,
    });
  }
  // Paid bills must not reduce debt from unrelated invoices.
  if (original.paymentMethod === 'credit' && original.customerId) {
    const adjusted = await tx
      .update(customers)
      .set({
        outstandingBalance: sql`${customers.outstandingBalance} - ${total.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customers.id, original.customerId),
          eq(customers.businessId, user.businessId),
          gte(customers.outstandingBalance, total.toFixed(2)),
        ),
      )
      .returning({ id: customers.id });
    if (!adjusted.length)
      throw new Error('credit return exceeds recorded debt; reconcile the balance');
  }
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'return.create',
    entity: 'salesReturn',
    entityId: row.id,
    after: { returnNo, originalBillNo: original.billNo, total: total.toFixed(2) },
  });
  revalidatePath('/returns');
  revalidatePath('/sales');
  revalidatePath('/products');
  revalidatePath('/inventory/batches');
  revalidatePath('/customers');
  return { id: row.id, returnNo, total: total.toFixed(2) };
});
