import { requireUser } from '@/lib/session';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from './_components/logout-button';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sales/new', label: 'POS' },
  { href: '/sales', label: 'Sales' },
  { href: '/returns', label: 'Returns' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/purchase-returns', label: 'Pur. Returns' },
  { href: '/quotations', label: 'Quotations' },
  { href: '/delivery-challans', label: 'Challans' },
  { href: '/settlements', label: 'Settlements' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/emi', label: 'EMI' },
  { href: '/reports/due-bills', label: 'Due Bills' },
  { href: '/reports', label: 'Reports' },
  { href: '/products', label: 'Products' },
  { href: '/products/barcode', label: 'Barcodes' },
  { href: '/damage-logs', label: 'Damage' },
  { href: '/customers', label: 'Customers' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/categories', label: 'Categories' },
  { href: '/brands', label: 'Brands' },
  { href: '/catalogues', label: 'Catalogues' },
  { href: '/stores', label: 'Stores' },
  { href: '/employees', label: 'Team' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/system', label: 'System' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="font-semibold">
              MyBizOne
            </Link>
            <div className="flex items-center gap-2 md:hidden">
              <span className="text-xs text-muted-foreground">{user.email}</span>
              <LogoutButton />
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {item.label}
              </Link>
            ))}
            <span className="hidden text-muted-foreground md:inline">{user.email}</span>
            <span className="hidden md:inline">
              <LogoutButton />
            </span>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
