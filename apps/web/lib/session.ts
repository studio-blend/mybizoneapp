import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  businessId: string | null;
  role: string;
  empId: string | null;
  mustChangePassword: boolean;
  active: boolean;
}

/**
 * Server-side session lookup. Returns null when unauthenticated.
 */
export async function getSessionUser(): Promise<AppUser | null> {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return null;
  const u = session.user as unknown as {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    businessId: string | null;
    role: string;
    empId: string | null;
    mustChangePassword: boolean;
    active: boolean;
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    emailVerified: u.emailVerified,
    businessId: u.businessId ?? null,
    role: u.role ?? 'owner',
    empId: u.empId ?? null,
    mustChangePassword: u.mustChangePassword ?? false,
    active: u.active ?? true,
  };
}

/**
 * Require an authenticated user with a tenant. Redirects when missing.
 */
export async function requireUser(): Promise<AppUser & { businessId: string }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.businessId) redirect('/onboarding');
  return user as AppUser & { businessId: string };
}
