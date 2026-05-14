export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'shop_manager'
  | 'branch_manager'
  | 'floor_manager'
  | 'sales'
  | 'marketing'
  | 'inventory'
  | 'billing'
  | 'accounts';

export type PermissionGate =
  | 'view_dashboard'
  | 'manage_products'
  | 'manage_inventory'
  | 'create_sale'
  | 'view_sales'
  | 'manage_purchases'
  | 'manage_customers'
  | 'manage_suppliers'
  | 'view_reports'
  | 'manage_expenses'
  | 'manage_employees'
  | 'manage_settings'
  | 'manage_billing'
  | 'manage_stores'
  | 'manage_departments'
  | 'manage_rbac'
  | 'transfer_ownership'
  | 'manage_campaigns';

// Role -> set of gates it grants
const ROLE_PERMISSIONS: Record<AppRole, PermissionGate[]> = {
  super_admin: [
    'view_dashboard',
    'manage_products',
    'manage_inventory',
    'create_sale',
    'view_sales',
    'manage_purchases',
    'manage_customers',
    'manage_suppliers',
    'view_reports',
    'manage_expenses',
    'manage_employees',
    'manage_settings',
    'manage_billing',
    'manage_stores',
    'manage_departments',
    'manage_rbac',
    'transfer_ownership',
    'manage_campaigns',
  ],
  admin: [
    'view_dashboard',
    'manage_products',
    'manage_inventory',
    'create_sale',
    'view_sales',
    'manage_purchases',
    'manage_customers',
    'manage_suppliers',
    'view_reports',
    'manage_expenses',
    'manage_employees',
    'manage_settings',
    'manage_billing',
    'manage_stores',
    'manage_departments',
    'manage_rbac',
    'manage_campaigns',
  ],
  shop_manager: [
    'view_dashboard',
    'manage_products',
    'manage_inventory',
    'create_sale',
    'view_sales',
    'manage_purchases',
    'manage_customers',
    'manage_suppliers',
    'view_reports',
    'manage_expenses',
    'manage_employees',
  ],
  branch_manager: [
    'view_dashboard',
    'manage_products',
    'manage_inventory',
    'create_sale',
    'view_sales',
    'manage_purchases',
    'manage_customers',
    'view_reports',
    'manage_expenses',
  ],
  floor_manager: [
    'view_dashboard',
    'manage_products',
    'manage_inventory',
    'create_sale',
    'view_sales',
  ],
  sales: ['view_dashboard', 'create_sale', 'view_sales', 'manage_customers'],
  marketing: ['view_dashboard', 'manage_campaigns', 'manage_customers'],
  inventory: ['view_dashboard', 'manage_products', 'manage_inventory', 'manage_purchases'],
  billing: ['view_dashboard', 'create_sale', 'view_sales', 'manage_purchases'],
  accounts: ['view_dashboard', 'view_reports', 'manage_expenses'],
};

/**
 * Check if a set of user_roles rows grants a permission gate.
 * super_admin always wins.
 * Scoped roles (storeId/departmentId on the row) are only applied when
 * the gate context matches.
 */
export function hasPermission(
  userRoles: { role: AppRole; storeId?: string | null; departmentId?: string | null }[],
  gate: PermissionGate,
  opts?: { storeId?: string; departmentId?: string },
): boolean {
  // super_admin always wins
  if (userRoles.some((r) => r.role === 'super_admin')) return true;

  for (const ur of userRoles) {
    const grants = ROLE_PERMISSIONS[ur.role] ?? [];
    if (!grants.includes(gate)) continue;

    // If role is scoped to a store, check storeId matches
    if (ur.storeId && opts?.storeId && ur.storeId !== opts.storeId) continue;

    // If role is scoped to a dept, check deptId matches
    if (ur.departmentId && opts?.departmentId && ur.departmentId !== opts.departmentId) continue;

    return true;
  }
  return false;
}

/**
 * Check permission from users.role string (backward compat during transition).
 */
export function hasPermissionByRole(role: string, gate: PermissionGate): boolean {
  const appRole = role as AppRole;
  if (!ROLE_PERMISSIONS[appRole]) return false;
  return ROLE_PERMISSIONS[appRole].includes(gate);
}
