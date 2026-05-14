'use server';

import { safeAction } from '@/lib/server-action';
import { departments } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/session';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

const CreateDepartmentInput = z.object({
  name: z.string().min(1).max(100),
  storeId: optionalUuid,
  description: z.string().max(500).optional(),
});

export const createDepartmentAction = safeAction(
  CreateDepartmentInput,
  async (input, { user, tx }) => {
    if (!['super_admin', 'admin', 'owner'].includes(user.role)) {
      throw new Error('Permission denied — requires admin or higher');
    }

    const [row] = await tx
      .insert(departments)
      .values({
        businessId: user.businessId,
        name: input.name,
        storeId: input.storeId ?? null,
        description: input.description ?? null,
      })
      .returning({ id: departments.id });

    if (!row) throw new Error('Department insert failed');

    revalidatePath('/departments');
    return { id: row.id };
  },
);

const DeleteDepartmentInput = z.object({ id: uuid });

export const deleteDepartmentAction = safeAction(
  DeleteDepartmentInput,
  async (input, { user, tx }) => {
    if (!['super_admin', 'admin', 'owner'].includes(user.role)) {
      throw new Error('Permission denied — requires admin or higher');
    }

    const [existing] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.id, input.id), eq(departments.businessId, user.businessId)));

    if (!existing) throw new Error('Department not found');

    await tx
      .delete(departments)
      .where(and(eq(departments.id, input.id), eq(departments.businessId, user.businessId)));

    revalidatePath('/departments');
    return { ok: true };
  },
);
