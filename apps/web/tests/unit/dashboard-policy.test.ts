import {
  type DashboardGrant,
  dashboardPeriod,
  dashboardViews,
  resolveDashboardScope,
} from '@/lib/dashboard-policy';
import { permittedNavigation } from '@/lib/navigation';
import { describe, expect, it } from 'vitest';

const stores = [
  { id: 'a', name: 'Central' },
  { id: 'b', name: 'North' },
];
const departments = [
  { id: 'a1', name: 'Living', storeId: 'a' },
  { id: 'a2', name: 'Bedroom', storeId: 'a' },
  { id: 'b1', name: 'Office', storeId: 'b' },
];
describe('dashboard access and navigation', () => {
  it('gives owners an overview and combines multiple staff roles', () => {
    expect(dashboardViews([{ role: 'super_admin' }])[0]).toBe('overview');
    expect(
      dashboardViews([
        { role: 'billing', storeId: 'a' },
        { role: 'sales', storeId: 'a' },
      ]),
    ).toEqual(['sales', 'billing']);
    expect(dashboardViews([{ role: 'accounts' }])).toEqual(['accounts']);
    expect(dashboardViews([{ role: 'marketing' }])).toEqual(['marketing']);
  });
  it('lets the owner open every role workspace and narrow it to a department', () => {
    const roles: DashboardGrant[] = [{ role: 'super_admin' }];
    const views = dashboardViews(roles);
    expect(views).toEqual([
      'overview',
      'operations',
      'sales',
      'billing',
      'inventory',
      'accounts',
      'marketing',
    ]);
    for (const view of views)
      expect(resolveDashboardScope(roles, stores, departments, { view }).view).toBe(view);
    const department = resolveDashboardScope(roles, stores, departments, {
      view: 'operations',
      storeId: 'a',
      departmentId: 'a1',
    });
    expect(department.scopes).toEqual([{ storeId: 'a', departmentId: 'a1' }]);
    expect(department.departmentOnly).toBe(true);
    expect(department.financial).toBe(false);
    expect(resolveDashboardScope(roles, stores, departments, { view: 'inventory' }).financial).toBe(
      false,
    );
  });
  it('rejects unauthorized workspace, store and department URL parameters', () => {
    const roles: DashboardGrant[] = [{ role: 'branch_manager', storeId: 'a' }];
    for (const selection of [{ view: 'overview' }, { storeId: 'b' }, { departmentId: 'b1' }])
      expect(() => resolveDashboardScope(roles, stores, departments, selection)).toThrow(
        /outside your access/,
      );
  });
  it('preserves department boundaries and never treats stale grants as global', () => {
    const access = resolveDashboardScope(
      [{ role: 'floor_manager', storeId: 'a', departmentId: 'a1' }],
      stores,
      departments,
      {},
    );
    expect(access.scopes).toEqual([{ storeId: 'a', departmentId: 'a1' }]);
    expect(access.stores).toEqual([stores[0]]);
    expect(access.departments).toEqual([departments[0]]);
    expect(access.financial).toBe(false);
    expect(access.globalLedger).toBe(false);
    const stale = resolveDashboardScope(
      [{ role: 'floor_manager', departmentId: 'missing' }],
      stores,
      departments,
      {},
    );
    expect(stale.scopes).toEqual([]);
    expect(stale.stores).toEqual([]);
  });
  it('changes data scope with the workspace for users with roles in different stores', () => {
    const roles: DashboardGrant[] = [
      { role: 'sales', storeId: 'a' },
      { role: 'inventory', storeId: 'b' },
    ];
    expect(resolveDashboardScope(roles, stores, departments, { view: 'sales' }).stores).toEqual([
      stores[0],
    ]);
    expect(resolveDashboardScope(roles, stores, departments, { view: 'inventory' }).stores).toEqual(
      [stores[1]],
    );
    expect(() =>
      resolveDashboardScope(roles, stores, departments, { view: 'sales', storeId: 'b' }),
    ).toThrow();
  });
  it('hides shared ledgers when an owner filters to a store', () => {
    expect(
      resolveDashboardScope([{ role: 'super_admin' }], stores, departments, {}).globalLedger,
    ).toBe(true);
    const filtered = resolveDashboardScope([{ role: 'super_admin' }], stores, departments, {
      storeId: 'a',
    });
    expect(filtered.financial).toBe(true);
    expect(filtered.globalLedger).toBe(false);
  });
  it('only advertises destinations supported by existing page permissions', () => {
    const staff = permittedNavigation([{ role: 'billing', storeId: 'a' }]).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(staff).toEqual(['/sales/new', '/sales', '/warranties', '/orders']);
    expect(
      permittedNavigation([{ role: 'floor_manager', storeId: 'a', departmentId: 'a1' }]),
    ).toEqual([]);
    const accounts = permittedNavigation([{ role: 'accounts' }]).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(accounts).toContain('/reports/pl');
    expect(accounts).not.toContain('/sales/new');
    expect(accounts).not.toContain('/team');
  });
});
describe('dashboard India time ranges', () => {
  it('uses the next India date when UTC is still the previous day', () => {
    const period = dashboardPeriod('today', new Date('2026-10-14T20:00:00Z'));
    expect(period.today).toBe('2026-10-15');
    expect(period.start.toISOString()).toBe('2026-10-14T18:30:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-15T18:30:00.000Z');
  });
  it('uses equal-length previous periods and the actual quarter boundary', () => {
    const month = dashboardPeriod('month', new Date('2026-10-15T06:00:00Z'));
    expect(month.start.getTime() - month.previousStart.getTime()).toBe(
      month.end.getTime() - month.start.getTime(),
    );
    expect(dashboardPeriod('quarter', new Date('2026-09-12T06:00:00Z')).start.toISOString()).toBe(
      '2026-06-30T18:30:00.000Z',
    );
  });
});
