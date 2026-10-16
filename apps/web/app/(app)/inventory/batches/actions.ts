'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { indiaToday, stockUnits, validExpiry } from '@/lib/stock-batch-policy';
import { lockedStockProduct } from '@/lib/stock-batches';
import { auditLogs, products, stockBatchMovements, stockBatches } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const batch = z.object({
  code: z.string().trim().min(1).max(80),
  qty: z.string().refine((value) => {
    try {
      return stockUnits(value) > 0;
    } catch {
      return false;
    }
  }, 'Enter a positive quantity up to 3 decimals'),
  expiresOn: z.string().optional(),
  quarantine: z.boolean().default(false),
});

export const enableBatchTrackingAction = safeAction(
  z.object({
    productId: z.string().uuid(),
    batches: z.array(batch).max(100),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    const product = await lockedStockProduct(tx, user.businessId, input.productId);
    if (!product.active) throw new Error('Product is inactive');
    if (product.batchTracking) throw new Error('Batch tracking is already enabled');
    if (
      input.batches.reduce((sum, item) => sum + stockUnits(item.qty), 0) !==
      stockUnits(product.inventory)
    )
      throw new Error(
        'Opening batches must exactly match current stock. Refresh and recount before enabling.',
      );
    if (new Set(input.batches.map((item) => item.code)).size !== input.batches.length)
      throw new Error('Use a different code for each opening batch');
    for (const item of input.batches) {
      if ((!item.quarantine && !item.expiresOn) || (item.expiresOn && !validExpiry(item.expiresOn)))
        throw new Error('Enter a valid expiry, or quarantine stock whose expiry is unknown');
      const [created] = await tx
        .insert(stockBatches)
        .values({
          businessId: user.businessId,
          productId: product.id,
          code: item.code,
          quantity: item.qty,
          expiresOn: item.expiresOn || null,
          state: item.quarantine ? 'quarantine' : 'available',
        })
        .returning({ id: stockBatches.id });
      if (!created) throw new Error('Opening batch failed');
      await tx.insert(stockBatchMovements).values({
        businessId: user.businessId,
        batchId: created.id,
        kind: 'opening',
        documentId: product.id,
        quantity: item.qty,
      });
    }
    await tx
      .update(products)
      .set({ batchTracking: true, updatedAt: new Date() })
      .where(eq(products.id, product.id));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'batch.enable',
      entity: 'product',
      entityId: product.id,
      before: { batchTracking: false, inventory: product.inventory },
      after: { batchTracking: true, inventory: product.inventory, batches: input.batches },
    });
    revalidatePath('/inventory/batches');
    revalidatePath('/products');
    revalidatePath('/sales/new');
    return { id: product.id };
  },
);

export const reviewBatchAction = safeAction(
  z.object({
    batchId: z.string().uuid(),
    decision: z.enum(['hold', 'release']),
    code: z.string().trim().min(1).max(80).optional(),
    expiresOn: z.string().optional(),
    note: z.string().trim().min(3, 'Explain the inspection decision').max(500),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    const [lookup] = await tx
      .select({ productId: stockBatches.productId })
      .from(stockBatches)
      .where(and(eq(stockBatches.id, input.batchId), eq(stockBatches.businessId, user.businessId)));
    if (!lookup) throw new Error('Batch not found');
    const product = await lockedStockProduct(tx, user.businessId, lookup.productId);
    if (!product.active || !product.batchTracking)
      throw new Error('Active batch-tracked product required');
    const [before] = await tx
      .select()
      .from(stockBatches)
      .where(and(eq(stockBatches.id, input.batchId), eq(stockBatches.businessId, user.businessId)))
      .for('update');
    if (!before || stockUnits(before.quantity) === 0)
      throw new Error('Batch has no stock to review');
    if (input.decision === 'release' && before.state !== 'quarantine')
      throw new Error('This batch is already available');
    if (input.decision === 'hold' && before.state === 'quarantine')
      throw new Error('This batch is already quarantined');
    const expiresOn = input.decision === 'release' ? input.expiresOn : before.expiresOn;
    if (
      input.decision === 'release' &&
      (!expiresOn || !validExpiry(expiresOn) || expiresOn <= indiaToday())
    )
      throw new Error('Release requires a verified expiry after today');
    const code = input.decision === 'release' ? input.code : before.code;
    if (!code) throw new Error('Enter the inspected batch code');
    // Receipt/sale history retains its lot identity. Returned lots get a new inspection code.
    if (
      input.decision === 'release' &&
      before.expiresOn &&
      (expiresOn !== before.expiresOn || code !== before.code)
    )
      throw new Error('A known lot retains its original code and expiry');
    const duplicates = await tx
      .select({ id: stockBatches.id })
      .from(stockBatches)
      .where(and(eq(stockBatches.productId, product.id), eq(stockBatches.code, code)));
    if (duplicates.some((item) => item.id !== before.id))
      throw new Error('Use a unique inspection code for this returned lot');
    const after = {
      state: input.decision === 'release' ? 'available' : 'quarantine',
      code,
      expiresOn,
    };
    await tx.update(stockBatches).set(after).where(eq(stockBatches.id, before.id));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: `batch.${input.decision}`,
      entity: 'stock_batch',
      entityId: before.id,
      before: { state: before.state, code: before.code, expiresOn: before.expiresOn },
      after: { ...after, note: input.note },
    });
    revalidatePath('/inventory/batches');
    revalidatePath('/sales/new');
    return { id: before.id };
  },
);
