import { describe, expect, it } from 'vitest';
import { hasPermission, hasPermissionByRole } from '../src/permissions';
import type { AppRole } from '../src/permissions';

const role = (r: AppRole) => [{ role: r, storeId: null, departmentId: null }];

describe('hasPermission', () => {
  it('super_admin always wins regardless of gate', () => {
    expect(hasPermission(role('super_admin'), 'transfer_ownership')).toBe(true);
    expect(hasPermission(role('super_admin'), 'manage_rbac')).toBe(true);
    expect(hasPermission(role('super_admin'), 'view_dashboard')).toBe(true);
  });

  it('admin has all gates except transfer_ownership', () => {
    expect(hasPermission(role('admin'), 'manage_employees')).toBe(true);
    expect(hasPermission(role('admin'), 'manage_departments')).toBe(true);
    expect(hasPermission(role('admin'), 'manage_rbac')).toBe(true);
    expect(hasPermission(role('admin'), 'transfer_ownership')).toBe(false);
  });

  it('sales can create_sale and manage_customers but not manage_products', () => {
    expect(hasPermission(role('sales'), 'create_sale')).toBe(true);
    expect(hasPermission(role('sales'), 'manage_customers')).toBe(true);
    expect(hasPermission(role('sales'), 'manage_products')).toBe(false);
    expect(hasPermission(role('sales'), 'view_reports')).toBe(false);
  });

  it('inventory can manage_products and manage_purchases but not create_sale', () => {
    expect(hasPermission(role('inventory'), 'manage_products')).toBe(true);
    expect(hasPermission(role('inventory'), 'manage_purchases')).toBe(true);
    expect(hasPermission(role('inventory'), 'create_sale')).toBe(false);
  });

  it('accounts can view_reports and manage_expenses but not create_sale', () => {
    expect(hasPermission(role('accounts'), 'view_reports')).toBe(true);
    expect(hasPermission(role('accounts'), 'manage_expenses')).toBe(true);
    expect(hasPermission(role('accounts'), 'create_sale')).toBe(false);
  });

  it('marketing can manage_campaigns and manage_customers', () => {
    expect(hasPermission(role('marketing'), 'manage_campaigns')).toBe(true);
    expect(hasPermission(role('marketing'), 'manage_customers')).toBe(true);
    expect(hasPermission(role('marketing'), 'create_sale')).toBe(false);
  });

  it('multi-role user gets union of all permissions', () => {
    const roles = [
      { role: 'sales' as AppRole, storeId: null, departmentId: null },
      { role: 'accounts' as AppRole, storeId: null, departmentId: null },
    ];
    expect(hasPermission(roles, 'create_sale')).toBe(true);
    expect(hasPermission(roles, 'view_reports')).toBe(true);
    expect(hasPermission(roles, 'manage_products')).toBe(false);
  });

  it('empty role array denies all gates', () => {
    expect(hasPermission([], 'view_dashboard')).toBe(false);
    expect(hasPermission([], 'create_sale')).toBe(false);
  });

  it('branch_manager with store scope: allows when storeId matches', () => {
    const roles = [{ role: 'branch_manager' as AppRole, storeId: 'store-1', departmentId: null }];
    // No storeId restriction in gate call — passes
    expect(hasPermission(roles, 'create_sale')).toBe(true);
    // Matching storeId — passes
    expect(hasPermission(roles, 'create_sale', { storeId: 'store-1' })).toBe(true);
    // Non-matching storeId — blocked
    expect(hasPermission(roles, 'create_sale', { storeId: 'store-2' })).toBe(false);
  });

  it('floor_manager with department scope: allows when departmentId matches', () => {
    const roles = [{ role: 'floor_manager' as AppRole, storeId: null, departmentId: 'dept-1' }];
    expect(hasPermission(roles, 'create_sale')).toBe(true);
    expect(hasPermission(roles, 'create_sale', { departmentId: 'dept-1' })).toBe(true);
    expect(hasPermission(roles, 'create_sale', { departmentId: 'dept-2' })).toBe(false);
  });

  it('shop_manager has broad access but no ownership/rbac/settings', () => {
    expect(hasPermission(role('shop_manager'), 'manage_employees')).toBe(true);
    expect(hasPermission(role('shop_manager'), 'transfer_ownership')).toBe(false);
    expect(hasPermission(role('shop_manager'), 'manage_rbac')).toBe(false);
    expect(hasPermission(role('shop_manager'), 'manage_settings')).toBe(false);
  });
});

describe('hasPermissionByRole', () => {
  it('works for legacy role string', () => {
    expect(hasPermissionByRole('super_admin', 'transfer_ownership')).toBe(true);
    expect(hasPermissionByRole('admin', 'manage_employees')).toBe(true);
    expect(hasPermissionByRole('sales', 'create_sale')).toBe(true);
    expect(hasPermissionByRole('sales', 'manage_products')).toBe(false);
  });

  it('rejects unknown role strings', () => {
    expect(hasPermissionByRole('owner', 'view_dashboard')).toBe(false);
    expect(hasPermissionByRole('unknown', 'create_sale')).toBe(false);
  });
});
