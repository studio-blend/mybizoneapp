import { db } from '@/lib/db';
import { userRoles } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import type { AppRole } from '@mybizone/domain';
import { eq } from 'drizzle-orm';

export interface UserRoleRow {
  role: AppRole;
  storeId?: string | null;
  departmentId?: string | null;
}

/**
 * Load the user_roles rows for a user from the DB.
 * Falls back to the legacy users.role string if no rows exist yet
 * (backward compat during migration before backfill runs).
 */
export async function getUserRoles(user: {
  id: string;
  businessId: string;
  role?: string;
}): Promise<UserRoleRow[]> {
  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        role: userRoles.role,
        storeId: userRoles.storeId,
        departmentId: userRoles.departmentId,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));
  });

  if (rows.length === 0 && user.role) {
    // Legacy fallback: map old role strings to new AppRole equivalents
    const legacyRole = user.role === 'owner' ? 'super_admin' : (user.role as AppRole);
    return [{ role: legacyRole, storeId: null, departmentId: null }];
  }

  return rows as UserRoleRow[];
}
