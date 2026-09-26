import { type PermissionGate, hasPermission } from '@mybizone/domain';
import { getUserRoles } from './get-user-roles';
import type { AppUser } from './session';

export async function requirePermission(
  user: AppUser & { businessId: string },
  gate: PermissionGate,
  scope?: { storeId?: string; departmentId?: string },
): Promise<void> {
  if (!hasPermission(await getUserRoles(user), gate, scope)) {
    throw new Error('Permission denied');
  }
}
