'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, damageLogs, products } from '@mybizone/db';
import { financialYear } from '@mybizone/domain/bill-series';
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
const qtyText = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'expected qty up to 3dp');

const DAMAGE_REASONS = ['damaged', 'theft', 'spillage', 'expired', 'other'] as const;

const CreateDamageLogInput = z.object({
  productId: uuid,
  qty: qtyText,
  reason: z.enum(DAMAGE_REASONS),
  notes: optionalText(500),
});

export const createDamageLogAction = safeAction(
  CreateDamageLogInput,
  async (input, { user, tx }) => {
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
    const totalValue =
      costPerUnit != null ? (qty * Number(costPerUnit)).toFixed(2) : null;

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

    // 4. Decrement product inventory (no floor check — damage can push below 0)
    await tx
      .update(products)
      .set({ inventory: sql`${products.inventory} - ${input.qty}`, updatedAt: new Date() })
      .where(and(eq(products.id, input.productId), eq(products.businessId, user.businessId)));

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

    return { id: logRow.id };
  },
);
