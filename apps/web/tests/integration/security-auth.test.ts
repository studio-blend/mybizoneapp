import { randomUUID } from 'node:crypto';
import { account, businesses, invitations, session, stores, user, userRoles } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

const enabled =
  process.env.DATABASE_URL === 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({ cookie: '' }));
vi.mock('@/lib/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'security-regression-only-secret-2026',
    BETTER_AUTH_URL: 'http://localhost:3000',
    LAN_MODE: true,
    RESEND_API_KEY: '',
    EMAIL_FROM: 'test@example.invalid',
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: state.cookie }) }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/employee-credentials';
import { getUserRoles } from '@/lib/get-user-roles';
import { requirePermission } from '@/lib/require-permission';
import { getSessionUser } from '@/lib/session';
import {
  createEmployeeAction,
  createInvitationAction,
  deactivateEmployeeAction,
  resetEmployeePasswordAction,
  revokeInvitationAction,
  toggleLockAction,
  updateEmployeeAction,
} from '../../app/(app)/employees/actions';
import { updateBusinessProfileAction } from '../../app/(app)/settings/business/actions';
import { acceptOwnershipTransferAction } from '../../app/(app)/settings/transfer/accept/actions';
import { initiateOwnershipTransferAction } from '../../app/(app)/settings/transfer/actions';
import { updateStoreProfileAction } from '../../app/(app)/stores/actions';
import { grantRoleAction, revokeRoleAction } from '../../app/(app)/team/actions';

const fixtureBusinesses: string[] = [];
async function fixture() {
  const [business] = await db
    .insert(businesses)
    .values({ name: 'S3 auth', plan: 'pro' })
    .returning();
  fixtureBusinesses.push(business!.id);
  const [store] = await db
    .insert(stores)
    .values({ businessId: business!.id, name: 'S3 store' })
    .returning();
  return { businessId: business!.id, storeId: store!.id };
}
async function member(businessId: string, role = 'employee', storeId: string | null = null) {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: 'S3 member',
    email: `${id}@example.invalid`,
    emailVerified: true,
    businessId,
    role,
    storeId,
  });
  const token = randomUUID();
  await db
    .insert(session)
    .values({ id: randomUUID(), userId: id, token, expiresAt: new Date(Date.now() + 600_000) });
  const cookie = `mybizone.session_token=${signSessionToken(token, 'security-regression-only-secret-2026')}`;
  return { id, cookie };
}
async function currentUser() {
  const current = await getSessionUser();
  if (!current?.businessId) throw new Error('Missing fixture session');
  return { ...current, businessId: current.businessId };
}
describe.skipIf(!enabled)('authentication and authorization on isolated PostgreSQL', () => {
  it('saves independent profiles only for authorized tenants and preserves store overrides', async () => {
    const a = await fixture();
    const b = await fixture();
    const owner = await member(a.businessId, 'owner');
    const staff = await member(a.businessId, 'employee', a.storeId);
    state.cookie = owner.cookie;
    expect(
      (await updateBusinessProfileAction({ businessProfile: 'grocery', sellingModel: 'both' })).ok,
    ).toBe(true);
    expect(
      (
        await updateStoreProfileAction({
          storeId: a.storeId,
          businessProfile: 'furniture',
          sellingModel: null,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await updateStoreProfileAction({
          storeId: b.storeId,
          businessProfile: 'electronics',
          sellingModel: 'retail',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateBusinessProfileAction({
          businessProfile: 'food_service',
          sellingModel: 'made-up',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateBusinessProfileAction({
          businessProfile: 'electronics',
          sellingModel: 'wholesale',
        })
      ).ok,
    ).toBe(true);
    const [store] = await db.select().from(stores).where(eq(stores.id, a.storeId));
    expect(store).toMatchObject({
      businessProfile: 'furniture',
      sellingModel: null,
      name: 'S3 store',
    });
    const [business] = await db.select().from(businesses).where(eq(businesses.id, a.businessId));
    expect(business).toMatchObject({ businessProfile: 'electronics', sellingModel: 'wholesale' });
    state.cookie = staff.cookie;
    expect(
      (await updateBusinessProfileAction({ businessProfile: 'grocery', sellingModel: 'retail' }))
        .ok,
    ).toBe(false);
    expect(
      (
        await updateStoreProfileAction({
          storeId: a.storeId,
          businessProfile: null,
          sellingModel: null,
        })
      ).ok,
    ).toBe(false);
    state.cookie = owner.cookie;
    expect(
      (
        await updateStoreProfileAction({
          storeId: a.storeId,
          businessProfile: null,
          sellingModel: null,
        })
      ).ok,
    ).toBe(true);
  });
  afterAll(async () => {
    try {
      for (const id of fixtureBusinesses) {
        await db.delete(userRoles).where(eq(userRoles.businessId, id));
        await db.delete(businesses).where(eq(businesses.id, id));
      }
    } finally {
      await (db as unknown as { $client?: { end: () => Promise<void> } }).$client?.end();
    }
  });
  it('accepts the employee cookie, enforces store scope, and invalidates locked/disabled access', async () => {
    const [business] = await db
      .insert(businesses)
      .values({ name: 'Security regression' })
      .returning();
    fixtureBusinesses.push(business!.id);
    const [store] = await db
      .insert(stores)
      .values({ businessId: business!.id, name: 'Assigned store' })
      .returning();
    const userId = randomUUID();
    const token = randomUUID();
    await db.insert(user).values({
      id: userId,
      name: 'Employee',
      email: `${userId}@example.invalid`,
      emailVerified: true,
      businessId: business!.id,
      role: 'employee',
      storeId: store!.id,
      active: true,
    });
    await db
      .insert(session)
      .values({ id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 60_000) });
    state.cookie = `mybizone.session_token=${signSessionToken(token, 'security-regression-only-secret-2026')}`;
    expect(
      (await auth.api.getSession({ headers: new Headers({ cookie: state.cookie }) }))?.user.id,
    ).toBe(userId);
    const current = await getSessionUser();
    expect(current?.storeId).toBe(store!.id);
    await expect(
      requirePermission(
        current as NonNullable<typeof current> & { businessId: string },
        'create_sale',
        { storeId: store!.id },
      ),
    ).resolves.toBeUndefined();
    await expect(
      requirePermission(
        current as NonNullable<typeof current> & { businessId: string },
        'create_sale',
      ),
    ).rejects.toThrow('Permission denied');
    // Migration 0016 omitted store scope when backfilling employee role rows.
    await db.insert(userRoles).values({ businessId: business!.id, userId, role: 'sales' });
    await expect(requirePermission(await currentUser(), 'create_sale')).rejects.toThrow(
      'Permission denied',
    );
    await expect(
      requirePermission(await currentUser(), 'create_sale', { storeId: randomUUID() }),
    ).rejects.toThrow('Permission denied');
    await expect(
      requirePermission(await currentUser(), 'create_sale', { storeId: store!.id }),
    ).resolves.toBeUndefined();
    await expect(
      requirePermission(
        current as NonNullable<typeof current> & { businessId: string },
        'manage_rbac',
      ),
    ).rejects.toThrow('Permission denied');
    await db.update(user).set({ lockedAt: new Date() }).where(eq(user.id, userId));
    expect(await getSessionUser()).toBeNull();
    await db.update(user).set({ lockedAt: null, active: false }).where(eq(user.id, userId));
    expect(await getSessionUser()).toBeNull();
  });
  it('revokes the final explicit admin grant without restoring legacy access or trusting a stale user', async () => {
    const { businessId } = await fixture();
    const owner = await member(businessId, 'owner');
    const admin = await member(businessId, 'admin');
    // Simulates an existing backfilled legacy account, before managed-role markers.
    const [grant] = await db
      .insert(userRoles)
      .values({ businessId, userId: admin.id, role: 'admin' })
      .returning();
    state.cookie = admin.cookie;
    const stale = await currentUser();
    await expect(requirePermission(stale, 'manage_rbac')).resolves.toBeUndefined();
    state.cookie = owner.cookie;
    expect((await revokeRoleAction({ userRoleId: grant!.id })).ok).toBe(true);
    await expect(requirePermission(stale, 'manage_rbac')).rejects.toThrow('Permission denied');
    state.cookie = admin.cookie;
    expect(await getUserRoles(await currentUser())).toEqual([]);
    expect(
      (await grantRoleAction({ userId: owner.id, role: 'admin', storeId: '', departmentId: '' }))
        .ok,
    ).toBe(false);
  });
  it('uses current scoped grants for team administration and protects owner grants and foreign targets', async () => {
    const a = await fixture();
    const b = await fixture();
    const owner = await member(a.businessId, 'owner');
    const admin = await member(a.businessId, 'employee');
    const employee = await member(a.businessId);
    const outsider = await member(b.businessId);
    state.cookie = owner.cookie;
    expect(
      (
        await grantRoleAction({
          userId: admin.id,
          role: 'admin',
          storeId: a.storeId,
          departmentId: '',
        })
      ).ok,
    ).toBe(true);
    state.cookie = admin.cookie;
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'sales',
          storeId: a.storeId,
          departmentId: '',
        })
      ).ok,
    ).toBe(false);
    state.cookie = owner.cookie;
    expect(
      (await grantRoleAction({ userId: admin.id, role: 'admin', storeId: '', departmentId: '' }))
        .ok,
    ).toBe(true);
    state.cookie = admin.cookie;
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'sales',
          storeId: a.storeId,
          departmentId: '',
        })
      ).ok,
    ).toBe(true);
    expect(
      (await grantRoleAction({ userId: outsider.id, role: 'admin', storeId: '', departmentId: '' }))
        .ok,
    ).toBe(false);
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'sales',
          storeId: b.storeId,
          departmentId: '',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'super_admin',
          storeId: '',
          departmentId: '',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await grantRoleAction({ userId: owner.id, role: 'sales', storeId: '', departmentId: '' }))
        .ok,
    ).toBe(false);
    state.cookie = owner.cookie;
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'super_admin',
          storeId: a.storeId,
          departmentId: '',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await grantRoleAction({
          userId: employee.id,
          role: 'super_admin',
          storeId: '',
          departmentId: '',
        })
      ).ok,
    ).toBe(true);
    state.cookie = employee.cookie;
    const [superGrant] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, employee.id), eq(userRoles.role, 'super_admin')));
    expect((await revokeRoleAction({ userRoleId: superGrant!.id })).ok).toBe(false);
    state.cookie = admin.cookie;
    expect((await revokeRoleAction({ userRoleId: superGrant!.id })).ok).toBe(false);
    for (const action of [
      () => updateEmployeeAction({ id: employee.id, role: 'employee', storeId: '' }),
      () => deactivateEmployeeAction({ id: employee.id }),
      () => toggleLockAction({ id: employee.id, lock: true }),
      () => resetEmployeePasswordAction({ id: employee.id }),
    ])
      expect((await action()).ok).toBe(false);
  });
  it('administers only same-business employees, resets sessions, and enforces demotion and account state', async () => {
    const a = await fixture();
    const b = await fixture();
    const owner = await member(a.businessId, 'owner');
    const outsider = await member(b.businessId);
    state.cookie = outsider.cookie;
    expect(
      (
        await createEmployeeAction({
          name: 'Denied',
          email: `${randomUUID()}@example.invalid`,
          role: 'admin',
          storeId: '',
        })
      ).ok,
    ).toBe(false);
    state.cookie = owner.cookie;
    expect(
      (
        await createEmployeeAction({
          name: 'Denied foreign store',
          email: `${randomUUID()}@example.invalid`,
          role: 'employee',
          storeId: b.storeId,
        })
      ).ok,
    ).toBe(false);
    const email = `${randomUUID()}@example.invalid`;
    expect(
      (await createEmployeeAction({ name: 'Allowed', email, role: 'employee', storeId: a.storeId }))
        .ok,
    ).toBe(true);
    const [employee] = await db.select().from(user).where(eq(user.email, email));
    expect(employee!.mustChangePassword).toBe(true);
    const [credential] = await db.select().from(account).where(eq(account.userId, employee!.id));
    expect(credential!.password).toBeTruthy();
    const token = randomUUID();
    await db.insert(session).values({
      id: randomUUID(),
      token,
      userId: employee!.id,
      expiresAt: new Date(Date.now() + 600_000),
    });
    const cookie = `mybizone.session_token=${signSessionToken(token, 'security-regression-only-secret-2026')}`;
    state.cookie = cookie;
    expect(
      (
        await createInvitationAction({
          email: `${randomUUID()}@example.invalid`,
          role: 'employee',
          storeId: '',
        })
      ).ok,
    ).toBe(false);
    state.cookie = owner.cookie;
    for (const id of [owner.id, outsider.id]) {
      expect((await updateEmployeeAction({ id, role: 'employee', storeId: '' })).ok).toBe(false);
      expect((await toggleLockAction({ id, lock: true })).ok).toBe(false);
      expect((await deactivateEmployeeAction({ id })).ok).toBe(false);
      expect((await resetEmployeePasswordAction({ id })).ok).toBe(false);
    }
    expect((await resetEmployeePasswordAction({ id: employee!.id })).ok).toBe(true);
    expect(await db.select().from(session).where(eq(session.userId, employee!.id))).toHaveLength(0);
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, employee!.id));
    await db
      .insert(userRoles)
      .values({ businessId: a.businessId, userId: employee!.id, role: 'admin' });
    expect(
      (await updateEmployeeAction({ id: employee!.id, role: 'employee', storeId: a.storeId })).ok,
    ).toBe(true);
    expect(
      await db.select().from(userRoles).where(eq(userRoles.userId, employee!.id)),
    ).toHaveLength(0);
    await db.insert(session).values({
      id: randomUUID(),
      token,
      userId: employee!.id,
      expiresAt: new Date(Date.now() + 600_000),
    });
    expect((await toggleLockAction({ id: employee!.id, lock: true })).ok).toBe(true);
    state.cookie = cookie;
    expect(await getSessionUser()).toBeNull();
    state.cookie = owner.cookie;
    expect((await toggleLockAction({ id: employee!.id, lock: false })).ok).toBe(true);
    state.cookie = cookie;
    const demoted = await currentUser();
    await expect(
      requirePermission(demoted, 'create_sale', { storeId: a.storeId }),
    ).resolves.toBeUndefined();
    await expect(requirePermission(demoted, 'manage_rbac')).rejects.toThrow('Permission denied');
    state.cookie = owner.cookie;
    expect((await deactivateEmployeeAction({ id: employee!.id })).ok).toBe(true);
    state.cookie = cookie;
    expect(await getSessionUser()).toBeNull();
    await expect(requirePermission(demoted, 'create_sale', { storeId: a.storeId })).rejects.toThrow(
      'Permission denied',
    );
  });
  it('creates and revokes invitations only with current business-wide administration access', async () => {
    const a = await fixture();
    const b = await fixture();
    const owner = await member(a.businessId, 'owner');
    const outsider = await member(b.businessId, 'owner');
    state.cookie = owner.cookie;
    expect(
      (
        await createInvitationAction({
          email: `${randomUUID()}@example.invalid`,
          role: 'employee',
          storeId: b.storeId,
        })
      ).ok,
    ).toBe(false);
    const result = await createInvitationAction({
      email: `${randomUUID()}@example.invalid`,
      role: 'employee',
      storeId: a.storeId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    state.cookie = outsider.cookie;
    expect((await revokeInvitationAction({ id: result.data.id })).ok).toBe(false);
    state.cookie = owner.cookie;
    expect((await revokeInvitationAction({ id: result.data.id })).ok).toBe(true);
    expect(
      await db.select().from(invitations).where(eq(invitations.id, result.data.id)),
    ).toHaveLength(0);
  });
  it('preserves legacy ownership and revalidates both parties before accepting an ownership token', async () => {
    const a = await fixture();
    const owner = await member(a.businessId, 'owner');
    const admin = await member(a.businessId, 'admin');
    const employee = await member(a.businessId);
    // Migration 0016 historically mapped the legacy owner string to sales.
    await db
      .insert(userRoles)
      .values({ businessId: a.businessId, userId: owner.id, role: 'sales' });
    state.cookie = owner.cookie;
    await expect(requirePermission(await currentUser(), 'manage_rbac')).resolves.toBeUndefined();
    expect((await initiateOwnershipTransferAction({ toUserId: employee.id })).ok).toBe(false);
    const transfer = await initiateOwnershipTransferAction({ toUserId: admin.id });
    expect(transfer.ok).toBe(true);
    if (!transfer.ok) throw new Error(transfer.error);
    state.cookie = employee.cookie;
    expect((await acceptOwnershipTransferAction({ token: transfer.data.token })).ok).toBe(false);
    state.cookie = admin.cookie;
    await db.update(user).set({ active: false }).where(eq(user.id, owner.id));
    expect((await acceptOwnershipTransferAction({ token: transfer.data.token })).ok).toBe(false);
    await db.update(user).set({ active: true }).where(eq(user.id, owner.id));
    expect((await acceptOwnershipTransferAction({ token: transfer.data.token })).ok).toBe(true);
    expect((await acceptOwnershipTransferAction({ token: transfer.data.token })).ok).toBe(false);
    await expect(
      requirePermission(await currentUser(), 'transfer_ownership'),
    ).resolves.toBeUndefined();
    state.cookie = owner.cookie;
    await expect(requirePermission(await currentUser(), 'transfer_ownership')).rejects.toThrow(
      'Permission denied',
    );
  });
});
