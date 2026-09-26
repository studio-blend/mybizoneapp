'use server';

import { getUserRoles } from '@/lib/get-user-roles';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { ownershipTransfers, userRoles, user as userTable } from '@mybizone/db';
import { hasPermission } from '@mybizone/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod/v3';

const AcceptInput = z.object({ token: z.string().min(1) });

export const acceptOwnershipTransferAction = safeAction(
  AcceptInput,
  async (input, { user, tx }) => {
    const now = new Date();

    // Find and validate the transfer
    const [transfer] = await tx
      .select({
        id: ownershipTransfers.id,
        businessId: ownershipTransfers.businessId,
        fromUserId: ownershipTransfers.fromUserId,
        toUserId: ownershipTransfers.toUserId,
        expiresAt: ownershipTransfers.expiresAt,
      })
      .from(ownershipTransfers)
      .where(
        and(
          eq(ownershipTransfers.token, input.token),
          isNull(ownershipTransfers.acceptedAt),
          gt(ownershipTransfers.expiresAt, now),
        ),
      )
      .for('update');

    if (!transfer) throw new Error('Invalid or expired transfer token');
    if (transfer.toUserId !== user.id) throw new Error('This transfer is not addressed to you');
    if (transfer.businessId !== user.businessId) throw new Error('Business mismatch');
    if (transfer.fromUserId === user.id) throw new Error('Cannot transfer ownership to yourself');
    // A pending token does not preserve a sender's revoked ownership authority.
    const [sender] = await tx
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, transfer.fromUserId), eq(userTable.businessId, user.businessId)))
      .for('update');
    if (
      !sender ||
      !hasPermission(
        await getUserRoles({ ...sender, businessId: user.businessId }),
        'transfer_ownership',
      )
    )
      throw new Error('Sender no longer has ownership authority');
    await requirePermission(user, 'manage_rbac');

    // Perform ownership swap in the same transaction
    // 1. Remove super_admin from fromUser in user_roles
    await tx
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, transfer.fromUserId),
          eq(userRoles.businessId, transfer.businessId),
          eq(userRoles.role, 'super_admin'),
        ),
      );

    // 2. Grant admin to fromUser
    await tx
      .insert(userRoles)
      .values({
        businessId: transfer.businessId,
        userId: transfer.fromUserId,
        role: 'admin',
        grantedBy: user.id,
      })
      .onConflictDoNothing();

    // 3. Remove any existing super_admin from toUser and grant it
    await tx
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, transfer.toUserId),
          eq(userRoles.businessId, transfer.businessId),
          eq(userRoles.role, 'super_admin'),
        ),
      );

    await tx
      .insert(userRoles)
      .values({
        businessId: transfer.businessId,
        userId: transfer.toUserId,
        role: 'super_admin',
        grantedBy: user.id,
      })
      .onConflictDoNothing();

    // 4. Update legacy users.role column for backward compat
    await tx
      .update(userTable)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(and(eq(userTable.id, transfer.fromUserId), eq(userTable.businessId, user.businessId)));

    await tx
      .update(userTable)
      .set({ role: 'super_admin', updatedAt: new Date() })
      .where(and(eq(userTable.id, transfer.toUserId), eq(userTable.businessId, user.businessId)));

    // 5. Mark transfer as accepted
    await tx
      .update(ownershipTransfers)
      .set({ acceptedAt: now })
      .where(eq(ownershipTransfers.id, transfer.id));

    return { ok: true };
  },
);
