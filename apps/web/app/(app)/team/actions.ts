'use server';

import { safeAction } from '@/lib/server-action';
import { departments, stores, userRoles } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

const APP_ROLES = [
  'super_admin',
  'admin',
  'shop_manager',
  'branch_manager',
  'floor_manager',
  'sales',
  'marketing',
  'inventory',
  'billing',
  'accounts',
] as const;

const GrantRoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(APP_ROLES),
  storeId: optionalUuid,
  departmentId: optionalUuid,
});

export const grantRoleAction = safeAction(GrantRoleInput, async (input, { user, tx }) => {
  if (!['super_admin', 'admin', 'owner'].includes(user.role)) {
    throw new Error('Permission denied — requires admin or higher');
  }

  // Only super_admin can grant super_admin
  if (input.role === 'super_admin' && user.role !== 'super_admin') {
    throw new Error('Only super_admin can grant super_admin role');
  }

  await tx
    .insert(userRoles)
    .values({
      businessId: user.businessId,
      userId: input.userId,
      role: input.role,
      storeId: input.storeId ?? null,
      departmentId: input.departmentId ?? null,
      grantedBy: user.id,
    })
    .onConflictDoNothing();

  revalidatePath('/team');
  return { ok: true };
});

const RevokeRoleInput = z.object({ userRoleId: uuid });

export const revokeRoleAction = safeAction(RevokeRoleInput, async (input, { user, tx }) => {
  if (!['super_admin', 'admin', 'owner'].includes(user.role)) {
    throw new Error('Permission denied — requires admin or higher');
  }

  const [existing] = await tx
    .select({ id: userRoles.id, role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.id, input.userRoleId), eq(userRoles.businessId, user.businessId)));

  if (!existing) throw new Error('Role not found');

  // Prevent revoking super_admin unless the caller is super_admin
  if (existing.role === 'super_admin' && user.role !== 'super_admin') {
    throw new Error('Only super_admin can revoke super_admin role');
  }

  await tx
    .delete(userRoles)
    .where(and(eq(userRoles.id, input.userRoleId), eq(userRoles.businessId, user.businessId)));

  revalidatePath('/team');
  return { ok: true };
});
