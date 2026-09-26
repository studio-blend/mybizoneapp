'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { auditLogs, categories, stores } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();
const blank = z.literal('');
const optionalUuid = z.union([uuid, blank]).transform((v) => (v === '' ? null : v));

const AttributeSchema = z
  .array(z.object({ name: z.string().max(60), unit: z.string().max(20).optional().default('') }))
  .default([]);

const CategoryInput = z.object({
  name: z.string().min(1, 'name required').max(120),
  parentId: optionalUuid,
  storeId: optionalUuid,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  attributes: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return [];
      try {
        return AttributeSchema.parse(JSON.parse(v));
      } catch {
        return [];
      }
    }),
});

export const createCategoryAction = safeAction(CategoryInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_products');
  if (input.parentId) {
    const [parent] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, input.parentId), eq(categories.businessId, user.businessId)));
    if (!parent) throw new Error('parent category not found');
  }

  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('store not found');
  }

  const [row] = await tx
    .insert(categories)
    .values({
      businessId: user.businessId,
      name: input.name,
      parentId: input.parentId,
      storeId: input.storeId,
      sortOrder: input.sortOrder,
      attributes: input.attributes,
    })
    .returning({ id: categories.id, name: categories.name });
  if (!row) throw new Error('insert failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'category.create',
    entity: 'category',
    entityId: row.id,
    after: { name: row.name },
  });

  revalidatePath('/categories');
  return { id: row.id, name: row.name };
});

const UpdateCategoryInput = z.object({
  id: uuid,
  name: z.string().min(1).max(120),
  parentId: optionalUuid,
  storeId: optionalUuid,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  attributes: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return [];
      try {
        return AttributeSchema.parse(JSON.parse(v));
      } catch {
        return [];
      }
    }),
});

export const updateCategoryAction = safeAction(UpdateCategoryInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_products');
  if (input.parentId) {
    const [parent] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, input.parentId), eq(categories.businessId, user.businessId)));
    if (!parent) throw new Error('parent category not found');
  }

  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('store not found');
  }

  if (input.parentId === input.id) {
    throw new Error('parent cannot be self');
  }

  const [before] = await tx
    .select({ name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(and(eq(categories.id, input.id), eq(categories.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  const [row] = await tx
    .update(categories)
    .set({
      name: input.name,
      parentId: input.parentId,
      storeId: input.storeId,
      sortOrder: input.sortOrder,
      attributes: input.attributes,
      updatedAt: new Date(),
    })
    .where(and(eq(categories.id, input.id), eq(categories.businessId, user.businessId)))
    .returning({ id: categories.id, name: categories.name });
  if (!row) throw new Error('update failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'category.update',
    entity: 'category',
    entityId: row.id,
    before,
    after: { name: row.name, parentId: input.parentId },
  });

  revalidatePath('/categories');
  return { id: row.id, name: row.name };
});

const DeleteCategoryInput = z.object({ id: uuid });

export const deleteCategoryAction = safeAction(DeleteCategoryInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_products');
  const [before] = await tx
    .select({ name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, input.id), eq(categories.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  await tx
    .delete(categories)
    .where(and(eq(categories.id, input.id), eq(categories.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'category.delete',
    entity: 'category',
    entityId: input.id,
    before,
  });

  revalidatePath('/categories');
  return { ok: true };
});
