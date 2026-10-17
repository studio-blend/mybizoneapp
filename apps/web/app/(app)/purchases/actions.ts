'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { stockUnits } from '@/lib/stock-batch-policy';
import { moveStockBatches } from '@/lib/stock-batches';
import { packFields, resolvePack } from '@/lib/wholesale';
import {
  type PackSnapshot,
  auditLogs,
  billSeries,
  products,
  purchaseItems,
  purchases,
  suppliers,
} from '@mybizone/db';
import { financialYear, formatBillNo } from '@mybizone/domain/bill-series';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, {
  message: 'expected qty up to 3 decimal places',
});
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, {
  message: 'expected a number with up to 2 decimal places',
});
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);

const CreatePurchaseInput = z.object({
  supplierId: optionalUuid,
  supplierName: z.string().min(1).max(120),
  purchaseDate: z.string().optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'credit', 'other']),
  notes: optionalText(500),
  items: z
    .array(
      z.object({
        ...packFields,
        productId: uuid,
        qty: qtyText.refine((v) => Number(v) > 0, 'quantity must be positive'),
        unitPrice: moneyText,
        batchCode: z.string().trim().max(80).optional(),
        expiresOn: z.string().optional(),
        serialNumbers: z.array(z.string().max(100)).max(500).optional(),
      }),
    )
    .min(1, 'add at least one item'),
});

interface CreatePurchaseResult {
  id: string;
  billNo: string;
}

export const createPurchaseAction = safeAction(CreatePurchaseInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_purchases');
  if (input.paymentMethod === 'credit' && !input.supplierId)
    throw new Error('select a supplier for credit purchases');
  if (input.supplierId) {
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)));
    if (!supplier) throw new Error('supplier not found');
  }
  const now = new Date();
  const purchaseDate =
    input.purchaseDate && input.purchaseDate.trim().length > 0 ? new Date(input.purchaseDate) : now;

  if (!Number.isFinite(purchaseDate.getTime())) throw new Error('invalid purchase date');

  // 1. Generate bill_no via bill_series (atomic, FY-aware).
  const fy = financialYear(purchaseDate);
  const [seriesRow] = await tx
    .insert(billSeries)
    .values({
      businessId: user.businessId,
      docType: 'purchase',
      financialYear: fy,
      prefix: 'PB',
      lastSeq: 1,
    })
    .onConflictDoUpdate({
      target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
      set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
    })
    .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
  if (!seriesRow) throw new Error('bill series assignment failed');
  const billNo = formatBillNo(seriesRow.prefix, fy, seriesRow.lastSeq);

  // 2. Snapshot product rows for all products in this business.
  const productRows = await tx
    .select({
      id: products.id,
      name: products.name,
      unitSymbol: products.unitSymbol,
      unitType: products.unitType,
      storeId: products.storeId,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      active: products.active,
    })
    .from(products)
    .where(eq(products.businessId, user.businessId));

  const byId = new Map(productRows.map((p) => [p.id, p]));

  // 3. Validate each item's productId exists and is active.
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) throw new Error(`product ${item.productId} not found`);
    if (!p.active) throw new Error(`product "${p.name}" is deleted`);
  }

  // 4. Compute line totals: lineTotal = qty × unitPrice.
  type LineCalc = {
    productId: string;
    qty: string;
    unitPrice: string;
    product: (typeof productRows)[number];
    lineTotal: string;
    packSnapshot: PackSnapshot | null;
    batchCode?: string;
    expiresOn?: string;
    serialNumbers?: string[];
  };

  const lines: LineCalc[] = [];
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p) throw new Error('unreachable');
    const converted = await resolvePack(tx, user.businessId, p, item);
    if (p.unitType === 'piece' && stockUnits(converted.qty) % 1000)
      throw new Error('Pieces require whole quantities');
    const lineTotal = (Number(converted.qty) * Number(item.unitPrice)).toFixed(2);
    lines.push({
      productId: item.productId,
      ...converted,
      unitPrice: item.unitPrice,
      product: p,
      lineTotal,
      batchCode: item.batchCode,
      expiresOn: item.expiresOn,
      serialNumbers: item.serialNumbers,
    });
  }

  const subtotal = lines.reduce((acc, l) => acc + Number(l.lineTotal), 0);
  const total = subtotal; // No GST recalc; taxTotal = 0.

  // 5. Insert purchases row.
  const [purchaseRow] = await tx
    .insert(purchases)
    .values({
      businessId: user.businessId,
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      billNo,
      financialYear: fy,
      purchaseDate,
      subtotal: subtotal.toFixed(2),
      taxTotal: '0.00',
      total: total.toFixed(2),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdBy: user.id,
    })
    .returning({ id: purchases.id });
  if (!purchaseRow) throw new Error('purchase insert failed');

  // 6. Insert purchase_items for each line.
  for (const line of lines) {
    await tx.insert(purchaseItems).values({
      purchaseId: purchaseRow.id,
      productId: line.productId,
      productName: line.product.name,
      qty: line.qty,
      unitSymbol: line.product.unitSymbol,
      unitPrice: line.unitPrice,
      packSnapshot: line.packSnapshot,
      hsnCode: line.product.hsnCode,
      gstRate: line.product.gstRate,
      gstAmount: '0.00',
      lineTotal: line.lineTotal,
    });

    // 7. Increment product inventory.
    const [received] = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} + ${line.qty}::numeric` })
      .where(
        and(
          eq(products.id, line.productId),
          eq(products.businessId, user.businessId),
          eq(products.unitType, line.product.unitType),
          eq(products.unitSymbol, line.product.unitSymbol),
          eq(products.storeId, line.product.storeId),
          eq(products.active, true),
        ),
      )
      .returning({ id: products.id });
    if (!received)
      throw new Error(
        'Product stock units or store changed. Refresh the purchase before receiving.',
      );
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: line.productId,
      qty: line.qty,
      kind: 'purchase',
      documentId: purchaseRow.id,
      batchCode: line.batchCode,
      expiresOn: line.expiresOn,
      serialNumbers: line.serialNumbers,
    });
  }

  // 8. If paymentMethod === 'credit' AND supplierId provided: increase outstanding balance.
  if (input.paymentMethod === 'credit' && input.supplierId) {
    await tx
      .update(suppliers)
      .set({
        outstandingBalance: sql`${suppliers.outstandingBalance} + ${total.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)));
  }

  // 9. Audit log.
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'purchase.create',
    entity: 'purchase',
    entityId: purchaseRow.id,
    after: {
      billNo,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      total: total.toFixed(2),
      paymentMethod: input.paymentMethod,
    },
  });

  // 10. Revalidate affected paths.
  revalidatePath('/purchases');
  revalidatePath('/products');
  revalidatePath('/inventory/batches');
  revalidatePath('/inventory/serials');
  if (input.paymentMethod === 'credit' && input.supplierId) {
    revalidatePath('/suppliers');
  }

  return { id: purchaseRow.id, billNo } satisfies CreatePurchaseResult;
});
