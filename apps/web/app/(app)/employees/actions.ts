'use server';

import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { hashCredential } from '@/lib/employee-credentials';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mailer';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { employeeWelcomeTemplate, invitationEmailTemplate } from '@mybizone/auth-config/email';
import {
  account,
  auditLogs,
  businesses,
  invitations,
  session,
  stores,
  userRoles,
  user as userTable,
} from '@mybizone/db';
import { type Plan, checkLimit, isValidPlan } from '@mybizone/domain/plans';
import { and, count, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const ROLES = ['admin', 'employee'] as const;
const uuid = z.string().uuid();
const optionalUuid = z.union([uuid, z.literal('')]).transform((v) => (v === '' ? null : v));

async function requireEditableEmployee(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  targetId: string,
) {
  const [target] = await tx
    .select({ role: userTable.role })
    .from(userTable)
    .where(and(eq(userTable.id, targetId), eq(userTable.businessId, businessId)))
    .for('update');
  if (!target) throw new Error('Employee not found');
  const ownerGrants = await tx
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, targetId),
        eq(userRoles.businessId, businessId),
        eq(userRoles.role, 'super_admin'),
      ),
    );
  if (['owner', 'super_admin'].includes(target.role) || ownerGrants.length)
    throw new Error('Cannot change an owner account');
}

const InviteInput = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ROLES),
  storeId: optionalUuid,
});

export const createInvitationAction = safeAction(InviteInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_rbac');
  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('Store not found');
  }
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [bizRows, userCountRows] = await Promise.all([
    tx
      .select({ name: businesses.name, plan: businesses.plan })
      .from(businesses)
      .where(eq(businesses.id, user.businessId)),
    tx
      .select({ n: count() })
      .from(userTable)
      .where(and(eq(userTable.businessId, user.businessId), eq(userTable.active, true))),
  ]);
  const biz = bizRows[0];

  const plan: Plan = isValidPlan(biz?.plan) ? (biz.plan as Plan) : 'free';
  const gate = checkLimit(plan, 'users', userCountRows[0]?.n ?? 0);
  if (!gate.allowed) {
    throw new Error(`upgrade required: user limit of ${gate.limit} reached on the free plan`);
  }

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

  const acceptUrl = `${env.BETTER_AUTH_URL}/accept-invite/${row.token}`;
  const { subject, html, text } = invitationEmailTemplate(
    acceptUrl,
    user.name,
    biz?.name ?? 'your team',
    input.role,
  );
  await sendMail({ to: input.email, subject, html, text });

  revalidatePath('/employees');
  return { id: row.id, token: row.token };
});

const RevokeInput = z.object({ id: uuid });

export const revokeInvitationAction = safeAction(RevokeInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_rbac');
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
  await requirePermission(user, 'manage_rbac');
  await requireEditableEmployee(tx, user.businessId, input.id);
  if (input.id === user.id) {
    throw new Error('cannot change your own role here');
  }
  const [before] = await tx
    .select({ role: userTable.role, storeId: userTable.storeId })
    .from(userTable)
    .where(and(eq(userTable.id, input.id), eq(userTable.businessId, user.businessId)));
  if (!before) throw new Error('employee not found');

  if (before.role === 'owner' || before.role === 'super_admin')
    throw new Error('Cannot change an owner account');
  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('Store not found');
  }
  await tx
    .update(userTable)
    .set({ role: input.role, storeId: input.storeId, updatedAt: new Date() })
    .where(and(eq(userTable.id, input.id), eq(userTable.businessId, user.businessId)));

  // Replace legacy role assignments consistently; old explicit grants must not survive demotion.
  await tx
    .delete(userRoles)
    .where(and(eq(userRoles.userId, input.id), eq(userRoles.businessId, user.businessId)));

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
  await requirePermission(user, 'manage_rbac');
  await requireEditableEmployee(tx, user.businessId, input.id);
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
        ne(userTable.role, 'super_admin'),
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

// ── Direct employee creation (empId + email) ─────────────────────────────────

function generateEmpId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'EMP';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)!];
  return id;
}

async function uniqueEmpId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = generateEmpId();
    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.empId, id))
      .limit(1);
    if (!existing) return id;
  }
  throw new Error('Failed to generate unique employee ID');
}

const CreateEmployeeInput = z.object({
  name: z.string().min(1, 'Name required').max(100),
  email: z.string().email().toLowerCase(),
  role: z.enum(['admin', 'employee']),
  storeId: optionalUuid,
});

export const createEmployeeAction = safeAction(CreateEmployeeInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_rbac');
  const [bizRows, userCountRows] = await Promise.all([
    tx
      .select({ name: businesses.name, plan: businesses.plan })
      .from(businesses)
      .where(eq(businesses.id, user.businessId)),
    tx
      .select({ n: count() })
      .from(userTable)
      .where(and(eq(userTable.businessId, user.businessId), eq(userTable.active, true))),
  ]);
  const biz = bizRows[0];
  const plan: Plan = isValidPlan(biz?.plan) ? (biz.plan as Plan) : 'free';
  const gate = checkLimit(plan, 'users', userCountRows[0]?.n ?? 0);
  if (!gate.allowed)
    throw new Error(`upgrade required: user limit of ${gate.limit} reached on the free plan`);

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, input.email))
    .limit(1);
  if (existing) throw new Error('An account with this email already exists');

  const empId = await uniqueEmpId();
  const initialPassword = randomBytes(18).toString('base64url');
  const passwordHash = await hashCredential(initialPassword);
  const userId = randomBytes(16).toString('hex');

  if (input.storeId) {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.storeId), eq(stores.businessId, user.businessId)));
    if (!store) throw new Error('Store not found');
  }
  await tx.insert(userTable).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
    businessId: user.businessId,
    role: input.role,
    storeId: input.storeId,
    empId,
    mustChangePassword: true,
    failedAttempts: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await tx.insert(account).values({
    id: randomBytes(16).toString('hex'),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'employee.create',
    entity: 'user',
    entityId: userId,
    after: { empId, email: input.email, role: input.role },
  });

  const loginUrl = `${env.BETTER_AUTH_URL}/login`;
  const { subject, html, text } = employeeWelcomeTemplate(
    input.name,
    empId,
    initialPassword,
    loginUrl,
  );
  sendMail({ to: input.email, subject, html, text }).catch((e: unknown) => {
    console.warn('[employees:create] welcome email failed:', e);
  });

  revalidatePath('/employees');
  return { empId };
});

const LockInput = z.object({ id: z.string().min(1), lock: z.boolean() });

export const toggleLockAction = safeAction(LockInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_rbac');
  await requireEditableEmployee(tx, user.businessId, input.id);
  if (input.id === user.id) throw new Error('Cannot lock your own account');
  const [emp] = await db
    .select({ id: userTable.id, role: userTable.role, businessId: userTable.businessId })
    .from(userTable)
    .where(eq(userTable.id, input.id))
    .limit(1);
  if (!emp || emp.businessId !== user.businessId) throw new Error('Not found');
  if (emp.role === 'owner' || emp.role === 'super_admin')
    throw new Error('Cannot lock an owner account');

  await tx
    .update(userTable)
    .set({
      lockedAt: input.lock ? new Date() : null,
      failedAttempts: input.lock ? 3 : 0,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, input.id));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: input.lock ? 'employee.lock' : 'employee.unlock',
    entity: 'user',
    entityId: input.id,
  });

  revalidatePath('/employees');
  return { ok: true };
});

const ResetPasswordInput = z.object({ id: z.string().min(1) });

export const resetEmployeePasswordAction = safeAction(
  ResetPasswordInput,
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_rbac');
    if (input.id === user.id) throw new Error('Use account password change for your own account');
    await requireEditableEmployee(tx, user.businessId, input.id);
    const [emp] = await db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        role: userTable.role,
        empId: userTable.empId,
        businessId: userTable.businessId,
      })
      .from(userTable)
      .where(eq(userTable.id, input.id))
      .limit(1);
    if (!emp || emp.businessId !== user.businessId || !emp.empId) throw new Error('Not found');

    if (emp.role === 'owner' || emp.role === 'super_admin')
      throw new Error('Cannot reset an owner account');
    const initialPassword = randomBytes(18).toString('base64url');
    const passwordHash = await hashCredential(initialPassword);
    await Promise.all([
      tx
        .update(account)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(and(eq(account.userId, input.id), eq(account.providerId, 'credential'))),
      tx
        .update(userTable)
        .set({ mustChangePassword: true, failedAttempts: 0, lockedAt: null, updatedAt: new Date() })
        .where(eq(userTable.id, input.id)),
    ]);

    await tx.delete(session).where(eq(session.userId, input.id));

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'employee.password_reset',
      entity: 'user',
      entityId: input.id,
    });

    const loginUrl = `${env.BETTER_AUTH_URL}/login`;
    const { subject, html, text } = employeeWelcomeTemplate(
      emp.name,
      emp.empId,
      initialPassword,
      loginUrl,
    );
    sendMail({ to: emp.email, subject: `[Password Reset] ${subject}`, html, text }).catch(
      (e: unknown) => {
        console.warn('[employees:reset] email failed:', e);
      },
    );

    revalidatePath('/employees');
    return { ok: true };
  },
);
