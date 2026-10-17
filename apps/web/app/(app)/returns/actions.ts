'use server';

import { randomUUID } from 'node:crypto';
import { lockOrder, reconcileOrderReturn } from '@/lib/order-ledger';
import { requestHash } from '@/lib/order-ledger';
import { requirePermission } from '@/lib/require-permission';
import { returnMoneySnapshot } from '@/lib/return-money';
import { safeAction } from '@/lib/server-action';
import { unallocatedSettlements, updateSettlementBillStatus } from '@/lib/settlement-ledger';
import { moveStockBatches } from '@/lib/stock-batches';
import {
  auditLogs,
  billSeries,
  customerOrderDeliveries,
  customers,
  products,
  returnItems,
  saleItems,
  sales,
  salesReturns,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { round2 } from '@mybizone/domain/money';
import { calculateReturnLines } from '@mybizone/domain/returns';
import { and, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const Input = z
  .object({
    id: z.string().uuid().default(randomUUID),
    allowRefundDue: z.boolean().default(false),
    originalSaleId: z.string().uuid().optional(),
    originalBillNo: z.string().trim().max(80).optional(),
    customerId: z.string().uuid().optional(),
    customerName: z.string().trim().max(120).optional(),
    reason: z.string().trim().max(500).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          serialNumbers: z.array(z.string().max(100)).max(500).optional(),
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
  // Order commands lock the order before its bill. Keep returns in that same order.
  const [lookup] = await tx
    .select({ id: sales.id })
    .from(sales)
    .where(
      and(
        eq(sales.businessId, user.businessId),
        input.originalSaleId
          ? eq(sales.id, input.originalSaleId)
          : eq(sales.billNo, input.originalBillNo!),
      ),
    );
  if (!lookup) throw new Error('original bill not found');
  const [delivery] = await tx
    .select({ orderId: customerOrderDeliveries.orderId })
    .from(customerOrderDeliveries)
    .where(
      and(
        eq(customerOrderDeliveries.saleId, lookup.id),
        eq(customerOrderDeliveries.businessId, user.businessId),
      ),
    );
  if (delivery) await requirePermission(user, 'create_sale');
  const sourceOrder = delivery ? await lockOrder(tx, user.businessId, delivery.orderId) : undefined;
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
  if (original.paymentMethod === 'order' && !sourceOrder)
    throw new Error('Order bill needs allocation reconciliation');
  if (original.billType === 'estimate') throw new Error('estimates cannot be returned');
  if (original.status !== 'completed') throw new Error('only completed sales can be returned');
  if (original.paymentMethod === 'credit' && !original.customerId)
    throw new Error('credit return requires the original customer and debt reconciliation');
  const hash = requestHash(input);
  const [prior] = await tx
    .select()
    .from(salesReturns)
    .where(and(eq(salesReturns.id, input.id), eq(salesReturns.businessId, user.businessId)));
  if (prior) {
    if (prior.requestHash !== hash)
      throw new Error('This return request was already used with different details');
    return { id: prior.id, returnNo: prior.returnNo, total: prior.total };
  }
  if (original.paymentMethod === 'credit' && original.customerId) {
    // Same party lock as settlement: the check and debt reduction must serialize.
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, original.customerId), eq(customers.businessId, user.businessId)))
      .for('update');
    if (
      !customer ||
      (await unallocatedSettlements(tx, user.businessId, 'sales', original.customerId)) > 0
    ) {
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
  const money = await returnMoneySnapshot(
    tx,
    user.businessId,
    'sales',
    original,
    total.toFixed(2),
    input.allowRefundDue,
  );
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
      id: input.id,
      requestHash: hash,
      ...money,
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
      .where(
        and(
          eq(products.id, line.productId),
          eq(products.businessId, user.businessId),
          eq(products.unitSymbol, source.unitSymbol),
          source.packSnapshot ? eq(products.unitType, source.packSnapshot.unitType) : undefined,
        ),
      )
      .returning({ id: products.id });
    if (!changed.length)
      throw new Error(
        'Returned product is unavailable or its stock units changed. Reconcile the original bill.',
      );
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: line.productId,
      qty: line.qty,
      kind: 'sales_return',
      documentId: row.id,
      originalSaleId: original.id,
      serialNumbers: input.items.find((item) => item.productId === line.productId)?.serialNumbers,
    });
  }
  // Paid bills must not reduce debt from unrelated invoices.
  if (sourceOrder)
    await reconcileOrderReturn(tx, sourceOrder, original.id, row.id, total.toFixed(2));
  if (original.paymentMethod === 'credit' && original.customerId) {
    const adjusted = await tx
      .update(customers)
      .set({
        outstandingBalance: sql`${customers.outstandingBalance} - ${money.debtReductionAmount}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customers.id, original.customerId),
          eq(customers.businessId, user.businessId),
          gte(customers.outstandingBalance, money.debtReductionAmount ?? '0'),
        ),
      )
      .returning({ id: customers.id });
    if (!adjusted.length)
      throw new Error('credit return exceeds recorded debt; reconcile the balance');
    await updateSettlementBillStatus(tx, user.businessId, original.id);
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
  revalidatePath('/inventory/serials');
  revalidatePath('/warranties');
  revalidatePath('/customers');
  revalidatePath('/settlements');
  revalidatePath('/settlements/funds');
  revalidatePath('/reports/due-bills');
  if (sourceOrder) {
    revalidatePath('/orders');
    revalidatePath(`/orders/${sourceOrder.id}`);
    revalidatePath('/dashboard');
    revalidatePath('/reports/balance-sheet');
    revalidatePath('/reports/due-bills');
    revalidatePath(`/sales/${original.id}`);
  }
  return { id: row.id, returnNo, total: total.toFixed(2) };
});
