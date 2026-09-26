'use server';

import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { auditLogs, businesses, invitations, stores, user as userTable } from '@mybizone/db';
import { checkLimit, isValidPlan } from '@mybizone/domain/plans';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function acceptInvitation(token: string) {
  const currentUser = await getSessionUser();
  if (
    !currentUser ||
    !currentUser.emailVerified ||
    currentUser.businessId ||
    currentUser.mustChangePassword
  )
    throw new Error('A verified unassigned account is required');
  await db.transaction(async (tx) => {
    // Serialize acceptance against other invitations for the same business.
    const [currentInvite] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, token),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .for('update');
    if (!currentInvite || currentInvite.email.toLowerCase() !== currentUser.email.toLowerCase())
      throw new Error('Invitation invalid or expired');
    const [business] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.id, currentInvite.businessId))
      .for('update');
    if (!business) throw new Error('Business not found');
    if (!['admin', 'employee'].includes(currentInvite.role))
      throw new Error('Invitation role is invalid');
    if (currentInvite.storeId) {
      const [store] = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(and(eq(stores.id, currentInvite.storeId), eq(stores.businessId, business.id)));
      if (!store) throw new Error('Invitation store is invalid');
    }
    const [usage] = await tx
      .select({ n: count() })
      .from(userTable)
      .where(and(eq(userTable.businessId, business.id), eq(userTable.active, true)));
    if (
      !checkLimit(isValidPlan(business.plan) ? business.plan : 'free', 'users', usage?.n ?? 0)
        .allowed
    )
      throw new Error('The business user limit has been reached');
    const [linked] = await tx
      .update(userTable)
      .set({
        businessId: currentInvite.businessId,
        role: currentInvite.role,
        storeId: currentInvite.storeId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userTable.id, currentUser.id),
          isNull(userTable.businessId),
          eq(userTable.active, true),
          isNull(userTable.lockedAt),
          eq(userTable.emailVerified, true),
          eq(userTable.mustChangePassword, false),
          eq(userTable.email, currentUser.email),
        ),
      )
      .returning({ id: userTable.id });
    if (!linked) throw new Error('Account already belongs to a business');
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, currentInvite.id));
    await tx.insert(auditLogs).values({
      businessId: currentInvite.businessId,
      actorId: currentUser.id,
      action: 'invitation.accept',
      entity: 'invitation',
      entityId: currentInvite.id,
      after: { role: currentInvite.role },
    });
  });
  redirect('/dashboard');
}
