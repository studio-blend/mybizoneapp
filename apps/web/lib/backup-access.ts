import { businesses } from '@mybizone/db';
import { hasPermission } from '@mybizone/domain';
import { db } from './db';
import { getUserRoles } from './get-user-roles';
import { getSessionUser } from './session';

/** Instance backups contain all tenants and are reserved for a sole LAN owner. */
export async function canManageInstanceBackups(): Promise<boolean> {
  if (process.env.LAN_MODE !== 'true') return false;
  const user = await getSessionUser();
  if (
    !user ||
    user.mustChangePassword ||
    !user.businessId ||
    !['owner', 'super_admin'].includes(user.role)
  )
    return false;
  if (
    !hasPermission(
      await getUserRoles({ ...user, businessId: user.businessId }),
      'transfer_ownership',
    )
  )
    return false;
  const tenants = await db.select({ id: businesses.id }).from(businesses).limit(2);
  return tenants.length === 1 && tenants[0]?.id === user.businessId;
}
