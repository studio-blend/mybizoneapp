'use server';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { departments, stores, userRoles, user as userTable } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

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
  await requirePermission(user, 'manage_rbac');

  // Only super_admin can grant super_admin
  if (input.role === 'super_admin') await requirePermission(user, 'transfer_ownership');

  const [target] = await tx
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(
      and(
        eq(userTable.id, input.userId),
        eq(userTable.businessId, user.businessId),
        eq(userTable.active, true),
      ),
    )
    .for('update');
  if (!target) throw new Error('Team member not found');
  if (['owner', 'super_admin'].includes(target.role))
    throw new Error('Use ownership transfer to change an owner account');
  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('Store not found');
  }
  if (input.departmentId) {
    const [department] = await tx
      .select({ id: departments.id, storeId: departments.storeId })
      .from(departments)
      .where(
        and(eq(departments.id, input.departmentId), eq(departments.businessId, user.businessId)),
      );
    if (!department || (input.storeId && department.storeId !== input.storeId))
      throw new Error('Department not found in store');
  }
  if (input.role === 'super_admin' && (input.storeId || input.departmentId))
    throw new Error('Owner role cannot be scoped');

  // Explicit grants replace the legacy fallback, including after the last revocation.
  await tx
    .update(userTable)
    .set({ role: 'custom', updatedAt: new Date() })
    .where(and(eq(userTable.id, input.userId), eq(userTable.businessId, user.businessId)));

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
  await requirePermission(user, 'manage_rbac');

  const [existing] = await tx
    .select({ id: userRoles.id, role: userRoles.role, userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.id, input.userRoleId), eq(userRoles.businessId, user.businessId)));

  if (!existing) throw new Error('Role not found');

  // Prevent revoking super_admin unless the caller is super_admin
  if (existing.role === 'super_admin') await requirePermission(user, 'transfer_ownership');
  const [target] = await tx
    .select({ role: userTable.role })
    .from(userTable)
    .where(and(eq(userTable.id, existing.userId), eq(userTable.businessId, user.businessId)))
    .for('update');
  if (!target) throw new Error('Team member not found');
  if (
    ['owner', 'super_admin'].includes(target.role) ||
    (existing.role === 'super_admin' && existing.userId === user.id)
  )
    throw new Error('Use ownership transfer to change an owner account');
  await tx
    .update(userTable)
    .set({ role: 'custom', updatedAt: new Date() })
    .where(and(eq(userTable.id, existing.userId), eq(userTable.businessId, user.businessId)));

  await tx
    .delete(userRoles)
    .where(and(eq(userRoles.id, input.userRoleId), eq(userRoles.businessId, user.businessId)));

  revalidatePath('/team');
  return { ok: true };
});
