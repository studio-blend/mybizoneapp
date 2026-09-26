'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { businesses, invitations, usageSnapshots, user as userTable } from '@mybizone/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod/v3';

const SignupSchema = z.object({
  name: z.string().min(1, 'name required').max(100),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8, 'min 8 characters').max(128),
  businessName: z.string().min(1, 'business name required').max(120),
  invitationToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export type SignupResult = { ok: true; needsVerification: boolean } | { ok: false; error: string };

/** Create the owner account, then atomically initialize its business and usage. */
export async function signupAction(input: unknown): Promise<SignupResult> {
  if (env.NODE_ENV === 'production' && !env.LAN_MODE && !env.RESEND_API_KEY) {
    return {
      ok: false,
      error: 'Account registration is temporarily unavailable. Please try again later.',
    };
  }
  const parsed = SignupSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'invalid input',
    };
  }
  const { name, email, password, businessName, invitationToken } = parsed.data;
  if (invitationToken) {
    const [invitation] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.token, invitationToken),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    if (!invitation) return { ok: false, error: 'Invitation is invalid or expired' };
  }

  let createdUserId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    createdUserId = z.object({ user: z.object({ id: z.string().min(1) }) }).parse(result).user.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signup failed';
    return { ok: false, error: msg };
  }

  // Invited accounts stay unassigned until the verified user explicitly accepts.
  if (invitationToken)
    return { ok: true, needsVerification: !(env.LAN_MODE && !env.RESEND_API_KEY) };

  try {
    await db.transaction(async (tx) => {
      const [biz] = await tx
        .insert(businesses)
        .values({ name: businessName })
        .returning({ id: businesses.id });
      if (!biz) throw new Error('business creation failed');
      const [linked] = await tx
        .update(userTable)
        .set({ businessId: biz.id, role: 'owner' })
        .where(and(eq(userTable.id, createdUserId), isNull(userTable.businessId)))
        .returning({ id: userTable.id });
      if (!linked) throw new Error('Account already linked');
      await tx.execute(sql`select set_config('app.business_id', ${biz.id}, true)`);
      await tx.insert(usageSnapshots).values({ businessId: biz.id, userCount: 1 });
    });
  } catch (err) {
    console.error('[signup] business link failed', err);
    await db
      .delete(userTable)
      .where(and(eq(userTable.id, createdUserId), isNull(userTable.businessId)))
      .catch(() => {
        console.error('[signup] account cleanup failed');
      });
    return { ok: false, error: 'Business setup failed. Please try signing up again.' };
  }

  return { ok: true, needsVerification: !env.LAN_MODE || Boolean(env.RESEND_API_KEY) };
}
