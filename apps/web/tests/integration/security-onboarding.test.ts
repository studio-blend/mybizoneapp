import { randomUUID } from 'node:crypto';
import {
  account,
  auditLogs,
  businesses,
  invitations,
  session,
  stores,
  usageSnapshots,
  user,
} from '@mybizone/db';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const enabled =
  process.env.DATABASE_URL === 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const state = vi.hoisted(() => ({ userId: '' }));
vi.mock('@/lib/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'onboarding-test-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    LAN_MODE: true,
  },
}));
vi.mock('@/lib/db', async () => {
  const { createDb } = await import('@mybizone/db');
  return { db: createDb('postgresql://postgres@127.0.0.1:55432/mybizone_release_test') };
});
vi.mock('@/lib/session', async () => {
  const { db } = await import('@/lib/db');
  const { user } = await import('@mybizone/db');
  const { eq } = await import('drizzle-orm');
  return {
    getSessionUser: async () => {
      if (!state.userId) return null;
      const [current] = await db.select().from(user).where(eq(user.id, state.userId));
      return current?.active && !current.lockedAt ? current : null;
    },
  };
});
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import { acceptInvitation } from '@/app/accept-invite/actions';
import { POST as changePassword } from '@/app/api/change-password/route';
import { POST as signIn } from '@/app/api/emp-signin/route';
import { completeSetupAction } from '@/app/setup/actions';
import { createBusiness } from '@/app/start-business/actions';
import { db } from '@/lib/db';
import { hashCredential, verifyCredential } from '@/lib/employee-credentials';

const businessIds: string[] = [];
const userIds: string[] = [];
async function business(plan: 'free' | 'pro' = 'pro') {
  const [row] = await db
    .insert(businesses)
    .values({ name: 'S3 onboarding fixture', plan })
    .returning();
  businessIds.push(row!.id);
  return row!;
}
async function member(extra: Partial<typeof user.$inferInsert> = {}) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: 'S3 account',
      email: `${id}@example.invalid`,
      emailVerified: true,
      ...extra,
    })
    .returning();
  userIds.push(id);
  return row!;
}
async function invite(
  target: typeof user.$inferSelect,
  extra: Partial<typeof invitations.$inferInsert> = {},
) {
  const tenant = await business();
  const [row] = await db
    .insert(invitations)
    .values({
      businessId: tenant.id,
      email: target.email,
      token: randomUUID(),
      role: 'employee',
      expiresAt: new Date(Date.now() + 60_000),
      ...extra,
    })
    .returning();
  return row!;
}
function request(body: unknown) {
  return new Request('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe.skipIf(!enabled)(
  'S3 invitation, onboarding and credential boundaries (isolated PostgreSQL)',
  () => {
    beforeEach(() => {
      state.userId = '';
    });
    afterAll(async () => {
      for (const id of userIds) await db.delete(user).where(eq(user.id, id));
      for (const id of businessIds) await db.delete(businesses).where(eq(businesses.id, id));
      await (db as unknown as { $client?: { end: () => Promise<void> } }).$client?.end();
    });
    it('accepts a verified matching account once and records tenant/store/audit', async () => {
      const actor = await member();
      const tenant = await business();
      const [store] = await db
        .insert(stores)
        .values({ businessId: tenant.id, name: 'Assigned' })
        .returning();
      const invitation = await invite(actor, { businessId: tenant.id, storeId: store!.id });
      state.userId = actor.id;
      await expect(acceptInvitation(invitation.token)).rejects.toThrow('REDIRECT:/dashboard');
      const [linked] = await db.select().from(user).where(eq(user.id, actor.id));
      expect(linked).toMatchObject({ businessId: tenant.id, role: 'employee', storeId: store!.id });
      expect(
        await db.select().from(auditLogs).where(eq(auditLogs.entityId, invitation.id)),
      ).toHaveLength(1);
      await expect(acceptInvitation(invitation.token)).rejects.toThrow('verified unassigned');
    });
    it.each([
      'anonymous',
      'wrong-email',
      'unverified',
      'inactive',
      'locked',
      'assigned',
      'temporary-password',
    ] as const)('rejects %s invitation acceptance without consuming it', async (condition) => {
      const actor = await member();
      const invitation = await invite(actor);
      state.userId = actor.id;
      if (condition === 'anonymous') state.userId = '';
      if (condition === 'wrong-email') state.userId = (await member()).id;
      if (condition === 'unverified')
        await db.update(user).set({ emailVerified: false }).where(eq(user.id, actor.id));
      if (condition === 'inactive')
        await db.update(user).set({ active: false }).where(eq(user.id, actor.id));
      if (condition === 'locked')
        await db.update(user).set({ lockedAt: new Date() }).where(eq(user.id, actor.id));
      if (condition === 'temporary-password')
        await db.update(user).set({ mustChangePassword: true }).where(eq(user.id, actor.id));
      if (condition === 'assigned')
        await db
          .update(user)
          .set({ businessId: invitation.businessId })
          .where(eq(user.id, actor.id));
      await expect(acceptInvitation(invitation.token)).rejects.toThrow();
      expect(
        (await db.select().from(invitations).where(eq(invitations.id, invitation.id)))[0]!
          .acceptedAt,
      ).toBeNull();
    });
    it.each(['expired', 'used', 'foreign-store', 'owner-role', 'full-plan'] as const)(
      'rejects %s invitation and preserves the unassigned account',
      async (condition) => {
        const actor = await member();
        const extra: Partial<typeof invitations.$inferInsert> = {};
        if (condition === 'expired') extra.expiresAt = new Date(Date.now() - 1000);
        if (condition === 'used') extra.acceptedAt = new Date();
        if (condition === 'owner-role') extra.role = 'owner';
        if (condition === 'foreign-store') {
          const other = await business();
          const [store] = await db
            .insert(stores)
            .values({ businessId: other.id, name: 'Foreign' })
            .returning();
          extra.storeId = store!.id;
        }
        if (condition === 'full-plan') {
          const free = await business('free');
          await member({ businessId: free.id });
          extra.businessId = free.id;
        }
        const invitation = await invite(actor, extra);
        state.userId = actor.id;
        await expect(acceptInvitation(invitation.token)).rejects.toThrow();
        expect(
          (await db.select().from(user).where(eq(user.id, actor.id)))[0]!.businessId,
        ).toBeNull();
      },
    );
    it('allows one new business for a verified unassigned account and rejects repeat creation', async () => {
      const actor = await member();
      state.userId = actor.id;
      const form = new FormData();
      form.set('name', 'New S3 business');
      const results = await Promise.allSettled([createBusiness(form), createBusiness(form)]);
      expect(
        results.filter(
          (r) => r.status === 'rejected' && String(r.reason).includes('REDIRECT:/onboarding'),
        ),
      ).toHaveLength(1);
      const [linked] = await db.select().from(user).where(eq(user.id, actor.id));
      businessIds.push(linked!.businessId!);
      expect(linked!.role).toBe('owner');
      expect(
        await db
          .select()
          .from(usageSnapshots)
          .where(eq(usageSnapshots.businessId, linked!.businessId!)),
      ).toHaveLength(1);
      await expect(createBusiness(form)).rejects.toThrow('verified unassigned');
    });
    it.each(['anonymous', 'unverified', 'inactive', 'locked', 'temporary-password'] as const)(
      'rejects %s new-business creation',
      async (condition) => {
        const actor = await member({
          emailVerified: condition !== 'unverified',
          active: condition !== 'inactive',
          lockedAt: condition === 'locked' ? new Date() : null,
          mustChangePassword: condition === 'temporary-password',
        });
        state.userId = condition === 'anonymous' ? '' : actor.id;
        const form = new FormData();
        form.set('name', 'Denied business');
        await expect(createBusiness(form)).rejects.toThrow('verified unassigned');
        expect(
          (await db.select().from(user).where(eq(user.id, actor.id)))[0]!.businessId,
        ).toBeNull();
      },
    );
    it('denies cloud bootstrap and repeat LAN bootstrap at the server action', async () => {
      const input = {
        businessName: 'Bootstrap',
        storeName: 'Store',
        storeType: 'retail' as const,
        adminName: 'Owner',
        adminEmail: 'owner@example.invalid',
        adminPassword: 'long-password',
      };
      try {
        vi.stubEnv('LAN_MODE', 'false');
        expect(await completeSetupAction(input)).toEqual({
          error: 'Setup is available only in LAN mode',
        });
        await business();
        vi.stubEnv('LAN_MODE', 'true');
        expect(await completeSetupAction({ ...input, adminPassword: 'weak' })).toMatchObject({
          error: expect.stringContaining('Invalid setup details'),
        });
        expect(await completeSetupAction(input)).toEqual({ error: 'Setup already completed' });
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it('enforces failed-login lockout, accepts unlocked credentials and revokes sessions on password change', async () => {
      const actor = await member({
        empId: randomUUID().slice(0, 12).toUpperCase(),
        mustChangePassword: true,
      });
      const oldPassword = 'old-test-password';
      await db.insert(account).values({
        id: randomUUID(),
        userId: actor.id,
        accountId: actor.id,
        providerId: 'credential',
        password: await hashCredential(oldPassword),
      });
      const guesses = await Promise.all(
        Array.from({ length: 3 }, () => signIn(request({ empId: actor.empId, password: 'wrong' }))),
      );
      expect(guesses.map((result) => result.status)).toEqual([401, 401, 401]);
      expect((await db.select().from(user).where(eq(user.id, actor.id)))[0]!.failedAttempts).toBe(
        3,
      );
      expect((await signIn(request({ empId: actor.empId, password: oldPassword }))).status).toBe(
        403,
      );
      await db.update(user).set({ lockedAt: null, failedAttempts: 0 }).where(eq(user.id, actor.id));
      const login = await signIn(request({ empId: actor.empId, password: oldPassword }));
      expect(login.status).toBe(200);
      expect(login.headers.get('set-cookie')).toContain('HttpOnly');
      state.userId = actor.id;
      expect(
        (
          await changePassword(
            request({ currentPassword: 'wrong', newPassword: 'new-test-password' }),
          )
        ).status,
      ).toBe(400);
      expect(await db.select().from(session).where(eq(session.userId, actor.id))).toHaveLength(1);
      expect(
        (
          await changePassword(
            request({ currentPassword: oldPassword, newPassword: 'new-test-password' }),
          )
        ).status,
      ).toBe(200);
      expect(await db.select().from(session).where(eq(session.userId, actor.id))).toHaveLength(0);
      const [credential] = await db.select().from(account).where(eq(account.userId, actor.id));
      expect(await verifyCredential('new-test-password', credential!.password!)).toBe(true);
      expect(
        (await db.select().from(user).where(eq(user.id, actor.id)))[0]!.mustChangePassword,
      ).toBe(false);
      await db.update(user).set({ active: false }).where(eq(user.id, actor.id));
      expect(
        (await signIn(request({ empId: actor.empId, password: 'new-test-password' }))).status,
      ).toBe(403);
      expect(
        (
          await changePassword(
            request({ currentPassword: 'new-test-password', newPassword: 'other-test-password' }),
          )
        ).status,
      ).toBe(401);
    });
    it('rejects malformed JSON bodies without throwing', async () => {
      expect((await signIn(request(null))).status).toBe(400);
      state.userId = (await member()).id;
      expect((await changePassword(request(null))).status).toBe(400);
    });
  },
);
