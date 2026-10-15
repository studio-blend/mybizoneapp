import { type AppRole, type PermissionGate, hasPermission } from '@mybizone/domain';

export type DashboardView =
  | 'overview'
  | 'operations'
  | 'sales'
  | 'billing'
  | 'inventory'
  | 'accounts'
  | 'marketing';
export type DashboardRange = 'today' | 'week' | 'month' | 'quarter';
export interface DashboardGrant {
  role: AppRole;
  storeId?: string | null;
  departmentId?: string | null;
}
export interface DashboardScope {
  storeId: string | null;
  departmentId: string | null;
}
export interface DashboardSelection {
  view?: string;
  range?: string;
  storeId?: string;
  departmentId?: string;
}
export interface ScopeStore {
  id: string;
  name: string;
}
export interface ScopeDepartment {
  id: string;
  name: string;
  storeId: string | null;
}

export const DASHBOARD_VIEWS: Record<DashboardView, { label: string; description: string }> = {
  overview: {
    label: 'Master dashboard',
    description: 'Performance across your business, with priorities for the day.',
  },
  operations: {
    label: 'Store operations',
    description: 'Sales activity, stock availability and the areas that need attention.',
  },
  sales: {
    label: 'Sales workspace',
    description: 'Your sales activity and the tools to serve the next customer.',
  },
  billing: {
    label: 'Billing workspace',
    description: 'Bills, payment methods and the next checkout.',
  },
  inventory: {
    label: 'Inventory workspace',
    description: 'Available stock, shortages and recent inventory movements.',
  },
  accounts: {
    label: 'Accounts workspace',
    description: 'Revenue, costs, receivables and payments to follow up.',
  },
  marketing: {
    label: 'Customer workspace',
    description: 'Customer growth, segments and recent follow-ups.',
  },
};
const ROLE_VIEWS: Record<AppRole, DashboardView[]> = {
  super_admin: ['overview', 'operations', 'sales', 'billing', 'inventory', 'accounts', 'marketing'],
  admin: ['overview', 'operations', 'sales', 'billing', 'inventory', 'accounts', 'marketing'],
  shop_manager: ['overview', 'operations', 'sales', 'inventory'],
  branch_manager: ['operations', 'sales', 'inventory'],
  floor_manager: ['operations', 'inventory'],
  sales: ['sales'],
  billing: ['billing'],
  inventory: ['inventory'],
  accounts: ['accounts'],
  marketing: ['marketing'],
};

export class DashboardAccessError extends Error {}
export function dashboardViews(roles: DashboardGrant[]): DashboardView[] {
  const allowed = new Set(
    roles
      .filter((r) =>
        hasPermission([r], 'view_dashboard', {
          storeId: r.storeId ?? undefined,
          departmentId: r.departmentId ?? undefined,
        }),
      )
      .flatMap((r) => ROLE_VIEWS[r.role] ?? []),
  );
  return (Object.keys(DASHBOARD_VIEWS) as DashboardView[]).filter((view) => allowed.has(view));
}

export function resolveDashboardScope(
  roles: DashboardGrant[],
  stores: ScopeStore[],
  departments: ScopeDepartment[],
  selection: DashboardSelection,
) {
  const views = dashboardViews(roles);
  const defaultView = views[0];
  if (!defaultView)
    throw new DashboardAccessError(
      'Your account has no dashboard access. Contact your administrator.',
    );
  if (selection.view && !views.includes(selection.view as DashboardView))
    throw new DashboardAccessError('This workspace is outside your access.');
  const view = (selection.view as DashboardView | undefined) ?? defaultView;
  if (view === 'marketing' && (selection.storeId || selection.departmentId))
    throw new DashboardAccessError(
      'Customer records are shared across the business. Clear store and department filters to use this workspace.',
    );
  const grants = roles.filter((r) => ROLE_VIEWS[r.role]?.includes(view));
  // Ignore stale/cross-business grants, never interpret a missing department as all stores.
  const validGrants = grants.filter(
    (r) =>
      (!r.storeId || stores.some((s) => s.id === r.storeId)) &&
      (!r.departmentId ||
        departments.some(
          (d) => d.id === r.departmentId && (!r.storeId || d.storeId === r.storeId),
        )),
  );
  const availableStores = stores.filter((s) =>
    validGrants.some(
      (r) =>
        (!r.storeId || r.storeId === s.id) &&
        (!r.departmentId ||
          departments.some((d) => d.id === r.departmentId && (!d.storeId || d.storeId === s.id))),
    ),
  );
  if (selection.storeId && !availableStores.some((s) => s.id === selection.storeId))
    throw new DashboardAccessError('This store is outside your access.');
  const selectedStores = selection.storeId
    ? availableStores.filter((s) => s.id === selection.storeId)
    : availableStores;
  const availableDepartments = departments.filter(
    (d) =>
      (!d.storeId || selectedStores.some((s) => s.id === d.storeId)) &&
      validGrants.some(
        (r) =>
          (!r.storeId || r.storeId === d.storeId) && (!r.departmentId || r.departmentId === d.id),
      ),
  );
  if (selection.departmentId && !availableDepartments.some((d) => d.id === selection.departmentId))
    throw new DashboardAccessError('This department is outside your access.');
  const scopes: DashboardScope[] = validGrants.flatMap((r) => {
    const departmentId = selection.departmentId || r.departmentId || null;
    const department = departmentId
      ? availableDepartments.find((d) => d.id === departmentId)
      : undefined;
    if (departmentId && !department) return [];
    if (r.departmentId && selection.departmentId && r.departmentId !== selection.departmentId)
      return [];
    const storeId = selection.storeId || r.storeId || department?.storeId || null;
    if (r.storeId && storeId !== r.storeId) return [];
    if (department?.storeId && storeId !== department.storeId) return [];
    return [{ storeId, departmentId }];
  });
  const uniqueScopes = [
    ...new Map(scopes.map((s) => [`${s.storeId}:${s.departmentId}`, s])).values(),
  ];
  const ranges: DashboardRange[] = ['today', 'week', 'month', 'quarter'];
  const range = ranges.includes(selection.range as DashboardRange)
    ? (selection.range as DashboardRange)
    : 'month';
  const global = uniqueScopes.some((s) => !s.storeId && !s.departmentId);
  const can = (gate: PermissionGate) =>
    uniqueScopes.length > 0 &&
    uniqueScopes.every((s) =>
      hasPermission(roles, gate, {
        storeId: s.storeId ?? undefined,
        departmentId: s.departmentId ?? undefined,
      }),
    );
  const departmentOnly = uniqueScopes.length > 0 && uniqueScopes.every((s) => !!s.departmentId);
  return {
    view,
    views,
    range,
    scopes: uniqueScopes,
    stores: availableStores,
    departments: availableDepartments,
    global,
    financial:
      can('view_reports') &&
      ['overview', 'accounts', 'operations'].includes(view) &&
      !(view === 'operations' && departmentOnly),
    globalLedger: global && hasPermission(roles, 'view_reports'),
    globalCustomers: global && hasPermission(roles, 'manage_customers'),
    departmentOnly,
  };
}

export function dashboardPeriod(range: DashboardRange, now: Date) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const end = new Date(dayStart.getTime() + 86400000);
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  const start =
    range === 'today'
      ? dayStart
      : range === 'week'
        ? new Date(end.getTime() - 7 * 86400000)
        : new Date(
            `${year}-${String(range === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : month).padStart(2, '0')}-01T00:00:00+05:30`,
          );
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - days * 86400000),
    previousEnd: start,
    label: {
      today: 'Today',
      week: 'Last 7 days',
      month: 'Month to date',
      quarter: 'Quarter to date',
    }[range],
    comparisonLabel: days === 1 ? 'vs yesterday' : `vs previous ${days} days`,
    today,
  };
}
