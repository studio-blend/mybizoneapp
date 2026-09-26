import { db } from '@/lib/db';
import { userRoles, user as userTable } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import type { AppRole } from '@mybizone/domain';
import { and, eq } from 'drizzle-orm';

export interface UserRoleRow {
  role: AppRole;
  storeId?: string | null;
  departmentId?: string | null;
}

/**
 * Load the user_roles rows for a user from the DB.
 * Falls back to the legacy users.role string if no rows exist yet
 * (backward compat during migration before backfill runs). Managed accounts
 * use the non-privileged `custom` marker so revocation never restores that fallback.
 */
export async function getUserRoles(user: {
  id: string;
  businessId: string;
  role?: string;
  storeId?: string | null;
}): Promise<UserRoleRow[]> {
  return withTenant(db, user.businessId, async (tx) => {
    const [current] = await tx
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, user.id), eq(userTable.businessId, user.businessId)));
    if (!current || !current.active || current.lockedAt || current.mustChangePassword) return [];
    // Ownership changes only via the ownership-transfer workflow. Older backfills
    // mapped legacy owners to sales; those rows must not lock the owner out.
    if (['owner', 'super_admin'].includes(current.role))
      return [{ role: 'super_admin', storeId: current.storeId, departmentId: null }];
    const rows = await tx
      .select({
        role: userRoles.role,
        storeId: userRoles.storeId,
        departmentId: userRoles.departmentId,
      })
      .from(userRoles)
      .where(and(eq(userRoles.userId, user.id), eq(userRoles.businessId, user.businessId)));
    if (rows.length === 0 && current.role !== 'custom') {
      // Legacy fallback: map old role strings to new AppRole equivalents
      const legacyRole =
        current.role === 'owner'
          ? 'super_admin'
          : current.role === 'employee'
            ? 'sales'
            : (current.role as AppRole);
      return [{ role: legacyRole, storeId: current.storeId ?? null, departmentId: null }];
    }

    // Pre-RBAC employee backfills omitted store_id. Preserve the assigned-store
    // boundary until an administrator explicitly manages this account's grants.
    if (current.role !== 'custom' && current.storeId) {
      return rows
        .filter((row) => !row.storeId || row.storeId === current.storeId)
        .map((row) => ({ ...row, storeId: current.storeId })) as UserRoleRow[];
    }
    return rows as UserRoleRow[];
  });
}
