import { user as userTable } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from './auth';
import { db } from './db';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  businessId: string | null;
  role: string;
  storeId: string | null;
  empId: string | null;
  mustChangePassword: boolean;
}

/**
 * Server-side session lookup. Returns null when unauthenticated.
 * Wrapped in React cache() so layout + page share one DB round-trip per request.
 */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  // Read current access state so disabling a user or changing a role takes effect
  // for existing sessions immediately.
  const [u] = await db.select().from(userTable).where(eq(userTable.id, session.user.id)).limit(1);
  if (!u || !u.active || u.lockedAt) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: u.emailVerified,
    businessId: u.businessId ?? null,
    role: u.role ?? 'employee',
    storeId: u.storeId ?? null,
    empId: u.empId ?? null,
    mustChangePassword: u.mustChangePassword ?? false,
  };
});

/**
 * Require an authenticated user with a tenant. Redirects when missing.
 */
export async function requireUser(): Promise<AppUser & { businessId: string }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/change-password');
  if (!user.businessId) redirect('/start-business');
  return user as AppUser & { businessId: string };
}
