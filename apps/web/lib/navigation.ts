import { type PermissionGate, hasPermission } from '@mybizone/domain';
import type { DashboardGrant } from './dashboard-policy';

export interface NavGroup {
  label: string;
  items: { href: string; label: string }[];
}
type Entry = { href: string; label: string; gate: PermissionGate; scoped?: boolean };
const definitions: { label: string; items: Entry[] }[] = [
  {
    label: 'Billing',
    items: [
      { href: '/sales/new', label: 'New Sale (POS)', gate: 'create_sale', scoped: true },
      { href: '/sales', label: 'Sales', gate: 'view_sales', scoped: true },
      { href: '/returns', label: 'Sales Returns', gate: 'create_sale' },
      { href: '/quotations', label: 'Quotations', gate: 'create_sale' },
      { href: '/delivery-challans', label: 'Delivery Challans', gate: 'create_sale' },
      { href: '/settlements', label: 'Settlements', gate: 'manage_expenses' },
      { href: '/emi', label: 'EMI', gate: 'view_sales' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { href: '/purchases', label: 'Purchase Bills', gate: 'manage_purchases' },
      { href: '/purchase-returns', label: 'Purchase Returns', gate: 'manage_purchases' },
      { href: '/expenses', label: 'Expenses', gate: 'manage_expenses' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/products', label: 'Products', gate: 'manage_products', scoped: true },
      { href: '/products/barcode', label: 'Barcodes', gate: 'manage_products' },
      { href: '/categories', label: 'Categories', gate: 'manage_products' },
      { href: '/brands', label: 'Brands', gate: 'manage_products' },
      { href: '/catalogues', label: 'Catalogues', gate: 'manage_products' },
      { href: '/damage-logs', label: 'Damage Logs', gate: 'manage_inventory' },
    ],
  },
  {
    label: 'Reports',
    items: [
      ...(
        [
          ['/reports', 'Reports overview'],
          ['/reports/due-bills', 'Due Bills'],
          ['/reports/pl', 'P&L'],
          ['/reports/balance-sheet', 'Balance Sheet'],
          ['/reports/gstr1', 'GSTR-1'],
          ['/reports/gstr3b', 'GSTR-3B'],
          ['/reports/e-invoice', 'E-Invoice'],
          ['/reports/closing-stock', 'Closing Stock'],
          ['/reports/inventory-valuation', 'Inventory Valuation'],
          ['/reports/performance', 'Performance'],
        ] as const
      ).map(([href, label]) => ({ href, label, gate: 'view_reports' as const })),
    ],
  },
  {
    label: 'CRM',
    items: [
      { href: '/customers', label: 'Customers', gate: 'manage_customers' },
      { href: '/suppliers', label: 'Suppliers', gate: 'manage_suppliers' },
      { href: '/cms', label: 'CMS / WhatsApp', gate: 'manage_campaigns' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/stores', label: 'Stores', gate: 'manage_stores' },
      { href: '/departments', label: 'Departments', gate: 'manage_departments' },
      { href: '/team', label: 'Team', gate: 'manage_rbac' },
      { href: '/employees', label: 'Employees', gate: 'manage_rbac' },
      { href: '/settings/billing', label: 'Plan & Billing', gate: 'manage_billing' },
      { href: '/settings/system', label: 'System', gate: 'transfer_ownership' },
      { href: '/settings/transfer', label: 'Ownership Transfer', gate: 'transfer_ownership' },
    ],
  },
];

// Scope-aware destinations are currently store-based. Department-only grants
// stay on their dashboard until those destinations support department access.
export function permittedNavigation(roles: DashboardGrant[]): NavGroup[] {
  return definitions
    .map((group) => ({
      label: group.label,
      items: group.items
        .filter(
          (item) =>
            hasPermission(roles, item.gate) ||
            (item.scoped &&
              roles.some(
                (role) =>
                  !role.departmentId &&
                  hasPermission([role], item.gate, { storeId: role.storeId ?? undefined }),
              )),
        )
        .map(({ href, label }) => ({ href, label })),
    }))
    .filter((group) => group.items.length > 0);
}
