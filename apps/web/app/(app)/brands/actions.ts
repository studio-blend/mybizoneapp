'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, brands } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = z
  .string()
  .max(500)
  .optional()
  .transform((v) => v?.trim() || null);

const BrandInput = z.object({
  name: z.string().min(1, 'name required').max(120),
  description: optionalText,
});

export const createBrandAction = safeAction(BrandInput, async (input, { user, tx }) => {
  const [row] = await tx
    .insert(brands)
    .values({
      businessId: user.businessId,
      name: input.name,
      description: input.description,
    })
    .returning({ id: brands.id, name: brands.name });
  if (!row) throw new Error('insert failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'brand.create',
    entity: 'brand',
    entityId: row.id,
    after: { name: row.name },
  });

  revalidatePath('/brands');
  return { id: row.id, name: row.name };
});

const UpdateBrandInput = BrandInput.extend({ id: uuid });

export const updateBrandAction = safeAction(UpdateBrandInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: brands.name, description: brands.description })
    .from(brands)
    .where(and(eq(brands.id, input.id), eq(brands.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  const [row] = await tx
    .update(brands)
    .set({
      name: input.name,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(and(eq(brands.id, input.id), eq(brands.businessId, user.businessId)))
    .returning({ id: brands.id, name: brands.name });
  if (!row) throw new Error('update failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'brand.update',
    entity: 'brand',
    entityId: row.id,
    before,
    after: { name: row.name },
  });

  revalidatePath('/brands');
  return { id: row.id, name: row.name };
});

const DeleteBrandInput = z.object({ id: uuid });

export const deleteBrandAction = safeAction(DeleteBrandInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: brands.name })
    .from(brands)
    .where(and(eq(brands.id, input.id), eq(brands.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  await tx
    .delete(brands)
    .where(and(eq(brands.id, input.id), eq(brands.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'brand.delete',
    entity: 'brand',
    entityId: input.id,
    before,
  });

  revalidatePath('/brands');
  return { ok: true };
});
