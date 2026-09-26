'use server';

import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { businesses, usageSnapshots, user as users } from '@mybizone/db';
import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function createBusiness(formData: FormData) {
  const currentUser = await getSessionUser();
  if (
    !currentUser ||
    !currentUser.emailVerified ||
    currentUser.businessId ||
    currentUser.mustChangePassword
  )
    throw new Error('A verified unassigned account is required');
  const name = String(formData.get('name') ?? '').trim();
  if (!name || name.length > 120) throw new Error('Enter a business name of up to 120 characters');
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(users)
      .where(eq(users.id, currentUser.id))
      .for('update');
    if (
      !account ||
      account.businessId ||
      !account.active ||
      account.lockedAt ||
      account.mustChangePassword ||
      !account.emailVerified
    )
      throw new Error('Account already belongs to a business');
    const [business] = await tx
      .insert(businesses)
      .values({ name })
      .returning({ id: businesses.id });
    if (!business) throw new Error('Business creation failed');
    await tx
      .update(users)
      .set({ businessId: business.id, role: 'owner', updatedAt: new Date() })
      .where(eq(users.id, currentUser.id));
    await tx.execute(sql`SELECT set_config('app.business_id', ${business.id}, true)`);
    await tx.insert(usageSnapshots).values({ businessId: business.id, userCount: 1 });
  });
  redirect('/onboarding');
}
