import { hasPermission } from '@mybizone/domain';
import type { DashboardGrant } from './dashboard-policy';
export function canReadOrder(roles: DashboardGrant[], storeId: string) {
  return (
    hasPermission(roles, 'view_sales', { storeId }) ||
    hasPermission(roles, 'view_reports', { storeId })
  );
}
export function canManageOrders(roles: DashboardGrant[]) {
  return hasPermission(roles, 'create_sale');
}
export function canCollectOrders(roles: DashboardGrant[]) {
  return hasPermission(roles, 'manage_customers') || hasPermission(roles, 'manage_expenses');
}
