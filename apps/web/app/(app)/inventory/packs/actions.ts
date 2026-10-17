'use server';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { auditLogs, productPacks, products } from '@mybizone/db';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';
const uuid = z.string().uuid();
const CreatePackInput = z.object({
  id: uuid,
  productId: uuid,
  name: z.string().trim().min(1).max(60),
  qtyPerPack: z
    .string()
    .regex(/^\d{1,9}(?:\.\d{1,3})?$/)
    .refine((v) => Number(v) > 0, 'Pack quantity must be positive'),
});
function refresh() {
  for (const p of ['/inventory/packs', '/sales/new', '/purchases/new', '/orders/new'])
    revalidatePath(p);
}
export const createPackAction = safeAction(CreatePackInput, async (input, { user, tx }) => {
  const [product] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.businessId, user.businessId)))
    .for('share');
  if (!product?.active) throw new Error('Active product not found');
  await requirePermission(user, 'manage_products', { storeId: product.storeId });
  if (product.unitType === 'piece' && !Number.isInteger(Number(input.qtyPerPack)))
    throw new Error('Pieces require whole quantities in a pack');
  const [existing] = await tx
    .select()
    .from(productPacks)
    .where(and(eq(productPacks.id, input.id), eq(productPacks.businessId, user.businessId)));
  if (existing) {
    if (
      existing.productId !== input.productId ||
      existing.name !== input.name ||
      Number(existing.qtyPerPack) !== Number(input.qtyPerPack) ||
      existing.unitType !== product.unitType ||
      existing.unitSymbol !== product.unitSymbol
    )
      throw new Error('Request ID already used for different pack details');
    return { id: existing.id };
  }
  const [duplicate] = await tx
    .select({ id: productPacks.id })
    .from(productPacks)
    .where(
      and(
        eq(productPacks.productId, product.id),
        eq(productPacks.businessId, user.businessId),
        eq(productPacks.active, true),
        sql`lower(${productPacks.name})=lower(${input.name})`,
      ),
    );
  if (duplicate)
    throw new Error(
      'An active pack already uses this name. Archive it before defining a replacement.',
    );
  await tx.insert(productPacks).values({
    ...input,
    businessId: user.businessId,
    unitType: product.unitType,
    unitSymbol: product.unitSymbol,
  });
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'pack.create',
    entity: 'product_pack',
    entityId: input.id,
    after: {
      productId: product.id,
      name: input.name,
      qtyPerPack: input.qtyPerPack,
      unit: product.unitSymbol,
    },
  });
  refresh();
  return { id: input.id };
});
export const archivePackAction = safeAction(z.object({ id: uuid }), async (input, { user, tx }) => {
  const [pack] = await tx
    .select()
    .from(productPacks)
    .where(and(eq(productPacks.id, input.id), eq(productPacks.businessId, user.businessId)))
    .for('update');
  if (!pack) throw new Error('Pack not found');
  const [product] = await tx
    .select({ storeId: products.storeId })
    .from(products)
    .where(and(eq(products.id, pack.productId), eq(products.businessId, user.businessId)));
  if (!product) throw new Error('Product not found');
  await requirePermission(user, 'manage_products', { storeId: product.storeId });
  if (!pack.active) return { id: pack.id };
  await tx
    .update(productPacks)
    .set({ active: false })
    .where(and(eq(productPacks.id, pack.id), eq(productPacks.businessId, user.businessId)));
  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'pack.archive',
    entity: 'product_pack',
    entityId: pack.id,
    before: { active: true },
    after: { active: false },
  });
  refresh();
  return { id: pack.id };
});
