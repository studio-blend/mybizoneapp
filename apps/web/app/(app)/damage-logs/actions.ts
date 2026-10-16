'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { moveStockBatches } from '@/lib/stock-batches';
import { auditLogs, damageLogs, products } from '@mybizone/db';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const qtyText = z
  .string()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp')
  .refine((value) => Number(value) > 0, 'Quantity must be positive');

const DAMAGE_REASONS = ['damaged', 'theft', 'spillage', 'expired', 'other'] as const;

const CreateDamageLogInput = z.object({
  productId: uuid,
  batchId: uuid.optional(),
  qty: qtyText,
  reason: z.enum(DAMAGE_REASONS),
  notes: optionalText(500),
});

export const createDamageLogAction = safeAction(
  CreateDamageLogInput,
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_inventory');
    // 1. Snapshot product name + unitSymbol + costPrice
    const [product] = await tx
      .select({
        id: products.id,
        name: products.name,
        unitSymbol: products.unitSymbol,
        costPrice: products.costPrice,
        active: products.active,
      })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.businessId, user.businessId)));
    if (!product) throw new Error('product not found');
    if (!product.active) throw new Error(`product "${product.name}" is deleted`);

    // 2. Compute totalValue = qty × costPerUnit (if costPrice exists)
    const qty = Number(input.qty);
    const costPerUnit = product.costPrice ? product.costPrice : null;
    const totalValue = costPerUnit != null ? (qty * Number(costPerUnit)).toFixed(2) : null;

    // 3. Insert into damageLogs with snapshot
    const [logRow] = await tx
      .insert(damageLogs)
      .values({
        businessId: user.businessId,
        productId: input.productId,
        productName: product.name,
        qty: input.qty,
        unitSymbol: product.unitSymbol,
        costPerUnit: costPerUnit,
        totalValue: totalValue,
        reason: input.reason,
        notes: input.notes,
        loggedBy: user.id,
      })
      .returning({ id: damageLogs.id });
    if (!logRow) throw new Error('damage log insert failed');

    // 4. Atomically guard stock; throwing rolls back the damage record too.
    const [updated] = await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} - ${input.qty}`, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.businessId, user.businessId),
          sql`${products.inventory} >= ${input.qty}`,
        ),
      )
      .returning({ id: products.id });
    if (!updated) throw new Error('Damage exceeds available stock');
    await moveStockBatches(tx, {
      businessId: user.businessId,
      productId: input.productId,
      qty: input.qty,
      kind: 'damage',
      documentId: logRow.id,
      batchId: input.batchId,
    });

    // 5. Audit log
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'damage.log',
      entity: 'damage_log',
      entityId: logRow.id,
      after: {
        productName: product.name,
        qty: input.qty,
        reason: input.reason,
        totalValue,
      },
    });

    // 6. Revalidate paths
    revalidatePath('/damage-logs');
    revalidatePath('/products');
    revalidatePath('/inventory/batches');

    return { id: logRow.id };
  },
);
