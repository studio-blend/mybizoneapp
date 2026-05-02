'use server';

import { businesses, user as userTable } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const SignupSchema = z.object({
  name: z.string().min(1, 'name required').max(100),
  email: z.string().email(),
  password: z.string().min(8, 'min 8 characters'),
  businessName: z.string().min(1, 'business name required').max(120),
});

export type SignupResult =
  | { ok: true; needsVerification: true }
  | { ok: false; error: string };

/**
 * Signup flow:
 *   1. Create Better Auth user (sends verification email automatically).
 *   2. Create a business row + link user.business_id (atomic).
 * If step 2 fails, the user row exists but is orphaned — they can re-signup
 * with a different email or contact support. Idempotency on businessId set
 * makes a re-run safe if we ever wire a retry.
 */
export async function signupAction(input: unknown): Promise<SignupResult> {
  const parsed = SignupSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'invalid input',
    };
  }
  const { name, email, password, businessName } = parsed.data;

  try {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signup failed';
    return { ok: false, error: msg };
  }

  try {
    await db.transaction(async (tx) => {
      const [biz] = await tx
        .insert(businesses)
        .values({ name: businessName })
        .returning({ id: businesses.id });
      if (!biz) throw new Error('business creation failed');
      await tx
        .update(userTable)
        .set({ businessId: biz.id, role: 'owner' })
        .where(eq(userTable.email, email));
    });
  } catch (err) {
    console.error('[signup] business link failed', err);
    return { ok: false, error: 'business setup failed; contact support' };
  }

  return { ok: true, needsVerification: true };
}
