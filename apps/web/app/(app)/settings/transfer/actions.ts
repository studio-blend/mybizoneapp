'use server';

import { getUserRoles } from '@/lib/get-user-roles';
import { safeAction } from '@/lib/server-action';
import { ownershipTransfers, user as userTable } from '@mybizone/db';
import { hasPermission } from '@mybizone/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();

const InitiateTransferInput = z.object({
  toUserId: z.string().min(1),
});

export const initiateOwnershipTransferAction = safeAction(
  InitiateTransferInput,
  async (input, { user, tx }) => {
    // Only super_admin can initiate ownership transfer
    const myRoles = await getUserRoles(user);
    if (!hasPermission(myRoles, 'transfer_ownership')) {
      throw new Error('Only super_admin can initiate ownership transfer');
    }

    // Verify target user is an admin in this business
    const [targetUser] = await tx
      .select({ id: userTable.id, name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(and(eq(userTable.id, input.toUserId), eq(userTable.businessId, user.businessId)));

    if (!targetUser) throw new Error('Target user not found in this business');
    if (input.toUserId === user.id) throw new Error('Cannot transfer ownership to yourself');

    // Use the existing tx from safeAction — already in withTenant context
    const targetRoles = await getUserRoles({ id: input.toUserId, businessId: user.businessId });
    const hasAdminRole = hasPermission(targetRoles, 'manage_rbac');

    if (!hasAdminRole) {
      throw new Error('Target user must have at least an admin role to receive ownership');
    }

    // Cancel any existing pending transfer
    await tx
      .delete(ownershipTransfers)
      .where(
        and(
          eq(ownershipTransfers.businessId, user.businessId),
          eq(ownershipTransfers.fromUserId, user.id),
          isNull(ownershipTransfers.acceptedAt),
        ),
      );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const [row] = await tx
      .insert(ownershipTransfers)
      .values({
        businessId: user.businessId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        token,
        expiresAt,
      })
      .returning({ id: ownershipTransfers.id, token: ownershipTransfers.token });

    if (!row) throw new Error('Failed to create ownership transfer');

    revalidatePath('/settings/transfer');
    return { token: row.token, expiresAt: expiresAt.toISOString(), toEmail: targetUser.email };
  },
);

const CancelTransferInput = z.object({ transferId: uuid });

export const cancelOwnershipTransferAction = safeAction(
  CancelTransferInput,
  async (input, { user, tx }) => {
    const myRoles = await getUserRoles(user);
    if (!hasPermission(myRoles, 'transfer_ownership')) {
      throw new Error('Only super_admin can cancel ownership transfer');
    }

    await tx
      .delete(ownershipTransfers)
      .where(
        and(
          eq(ownershipTransfers.id, input.transferId),
          eq(ownershipTransfers.businessId, user.businessId),
          eq(ownershipTransfers.fromUserId, user.id),
          isNull(ownershipTransfers.acceptedAt),
        ),
      );

    revalidatePath('/settings/transfer');
    return { ok: true };
  },
);
