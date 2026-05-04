'use server';

import { randomBytes } from 'node:crypto';
import { safeAction } from '@/lib/server-action';
import { auditLogs, invitations, user as userTable } from '@mybizone/db';
import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ROLES = ['admin', 'employee'] as const;
const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

const InviteInput = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ROLES),
  storeId: optionalUuid,
});

/**
 * Create an invitation: opaque token + 7-day TTL. Email is logged to console
 * in dev (matches M1 verification flow); Resend wiring lands with the M3 cutover.
 */
export const createInvitationAction = safeAction(InviteInput, async (input, { user, tx }) => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [row] = await tx
    .insert(invitations)
    .values({
      businessId: user.businessId,
      email: input.email,
      role: input.role,
      storeId: input.storeId,
      token,
      expiresAt,
      createdByUserId: user.id,
    })
    .returning({ id: invitations.id, token: invitations.token });
  if (!row) throw new Error('invitation insert failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'invitation.create',
    entity: 'invitation',
    entityId: row.id,
    after: { email: input.email, role: input.role },
  });

  // Dev-mode email surrogate. M3 swaps for Resend.
  if (process.env.NODE_ENV !== 'production') {
    const url = `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/accept-invite/${row.token}`;
    console.warn(`[invite] ${input.email} → ${url}`);
  }

  revalidatePath('/employees');
  return { id: row.id, token: row.token };
});

const RevokeInput = z.object({ id: uuid });

export const revokeInvitationAction = safeAction(RevokeInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ email: invitations.email })
    .from(invitations)
    .where(and(eq(invitations.id, input.id), eq(invitations.businessId, user.businessId)));
  if (!before) throw new Error('invitation not found');

  await tx
    .delete(invitations)
    .where(and(eq(invitations.id, input.id), eq(invitations.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'invitation.revoke',
    entity: 'invitation',
    entityId: input.id,
    before,
  });

  revalidatePath('/employees');
  return { ok: true };
});

const UpdateEmployeeInput = z.object({
  id: z.string().min(1),
  role: z.enum(ROLES),
  storeId: optionalUuid,
});

export const updateEmployeeAction = safeAction(UpdateEmployeeInput, async (input, { user, tx }) => {
  if (input.id === user.id) {
    throw new Error('cannot change your own role here');
  }
  const [before] = await tx
    .select({ role: userTable.role, storeId: userTable.storeId })
    .from(userTable)
    .where(and(eq(userTable.id, input.id), eq(userTable.businessId, user.businessId)));
  if (!before) throw new Error('employee not found');

  await tx
    .update(userTable)
    .set({ role: input.role, storeId: input.storeId, updatedAt: new Date() })
    .where(and(eq(userTable.id, input.id), eq(userTable.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'employee.role_change',
    entity: 'user',
    entityId: input.id,
    before,
    after: { role: input.role, storeId: input.storeId },
  });

  revalidatePath('/employees');
  return { ok: true };
});

const DeactivateInput = z.object({ id: z.string().min(1) });

export const deactivateEmployeeAction = safeAction(DeactivateInput, async (input, { user, tx }) => {
  if (input.id === user.id) {
    throw new Error('cannot deactivate yourself');
  }
  // Owners cannot be deactivated by anyone except via the businesses table directly.
  const [before] = await tx
    .select({ active: userTable.active, role: userTable.role, name: userTable.name })
    .from(userTable)
    .where(
      and(
        eq(userTable.id, input.id),
        eq(userTable.businessId, user.businessId),
        ne(userTable.role, 'owner'),
      ),
    );
  if (!before) throw new Error('employee not found or is owner');

  await tx
    .update(userTable)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(userTable.id, input.id), eq(userTable.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'employee.delete',
    entity: 'user',
    entityId: input.id,
    before: { active: before.active, role: before.role, name: before.name },
    after: { active: false },
  });

  revalidatePath('/employees');
  return { ok: true };
});
