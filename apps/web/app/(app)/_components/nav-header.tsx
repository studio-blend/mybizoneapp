'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { LogoutButton } from './logout-button';

interface NavGroup {
  label: string;
  items: { href: string; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Billing',
    items: [
      { href: '/sales/new', label: 'New Sale (POS)' },
      { href: '/sales', label: 'Sales' },
      { href: '/returns', label: 'Sales Returns' },
      { href: '/quotations', label: 'Quotations' },
      { href: '/delivery-challans', label: 'Delivery Challans' },
      { href: '/settlements', label: 'Settlements' },
      { href: '/emi', label: 'EMI' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { href: '/purchases', label: 'Purchase Bills' },
      { href: '/purchase-returns', label: 'Purchase Returns' },
      { href: '/expenses', label: 'Expenses' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/products', label: 'Products' },
      { href: '/products/barcode', label: 'Barcodes' },
      { href: '/categories', label: 'Categories' },
      { href: '/brands', label: 'Brands' },
      { href: '/catalogues', label: 'Catalogues' },
      { href: '/damage-logs', label: 'Damage Logs' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports/due-bills', label: 'Due Bills' },
      { href: '/reports/pl', label: 'P&L' },
      { href: '/reports/balance-sheet', label: 'Balance Sheet' },
      { href: '/reports/gstr1', label: 'GSTR-1' },
      { href: '/reports/gstr3b', label: 'GSTR-3B' },
      { href: '/reports/e-invoice', label: 'E-Invoice' },
      { href: '/reports/closing-stock', label: 'Closing Stock' },
      { href: '/reports/inventory-valuation', label: 'Inventory Valuation' },
      { href: '/reports/performance', label: 'Performance' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { href: '/customers', label: 'Customers' },
      { href: '/suppliers', label: 'Suppliers' },
      { href: '/cms', label: 'CMS / WhatsApp' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/stores', label: 'Stores' },
      { href: '/departments', label: 'Departments' },
      { href: '/team', label: 'Team' },
      { href: '/employees', label: 'Employees' },
      { href: '/settings/billing', label: 'Plan & Billing' },
      { href: '/settings/system', label: 'System' },
      { href: '/settings/transfer', label: 'Ownership Transfer' },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function Dropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isActive = group.items.some((i) => pathname?.startsWith(i.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted transition-colors ${isActive ? 'font-semibold' : ''}`}
      >
        {group.label}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md py-1">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm hover:bg-muted transition-colors ${pathname?.startsWith(item.href) ? 'font-semibold text-primary' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:bg-muted transition-colors"
        aria-label="User menu"
      >
        <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center select-none">
          {email[0]?.toUpperCase() ?? 'U'}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md py-1">
          <div className="px-4 py-2 border-b">
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
          <Link
            href="/settings/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            My Account
          </Link>
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Help &amp; Support
          </Link>
          <div className="border-t mt-1 pt-1 px-4 py-1">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}

interface NavHeaderProps {
  email: string;
}

export function NavHeader({ email }: NavHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Record<string, boolean>>({});
  const isOnboarding = pathname?.startsWith('/onboarding');

  function toggleMobileGroup(label: string) {
    setMobileOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  if (isOnboarding) {
    return (
      <header className="border-b bg-background">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <span className="font-semibold tracking-tight">MyBizOne</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          {/* Logo */}
          <Link href="/dashboard" className="font-semibold tracking-tight shrink-0 mr-4">
            MyBizOne
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            <Link href="/dashboard" className="rounded px-2 py-1 text-sm hover:bg-muted transition-colors">
              Dashboard
            </Link>
            {NAV_GROUPS.map((group) => (
              <Dropdown key={group.label} group={group} />
            ))}
          </nav>

          {/* Right side: user menu (desktop) */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <UserMenu email={email} />
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden rounded p-1.5 hover:bg-muted"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t py-2 space-y-0.5">
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="block rounded px-3 py-2 text-sm hover:bg-muted"
            >
              Dashboard
            </Link>

            {NAV_GROUPS.map((group) => {
              const groupOpen = !!mobileOpenGroups[group.label];
              const isActive = group.items.some((i) => pathname?.startsWith(i.href));
              return (
                <div key={group.label}>
                  <button
                    onClick={() => toggleMobileGroup(group.label)}
                    className={`w-full flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-muted transition-colors ${isActive ? 'font-semibold' : ''}`}
                  >
                    {group.label}
                    <ChevronIcon open={groupOpen} />
                  </button>
                  {groupOpen && (
                    <div className="ml-3 border-l pl-3 space-y-0.5 mb-1">
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`block rounded px-3 py-1.5 text-sm hover:bg-muted transition-colors ${pathname?.startsWith(item.href) ? 'font-semibold text-primary' : ''}`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* User section in mobile */}
            <div className="border-t pt-2 mt-1 space-y-0.5">
              <Link
                href="/settings/account"
                onClick={() => setMobileOpen(false)}
                className="block rounded px-3 py-2 text-sm hover:bg-muted"
              >
                My Account
              </Link>
              <Link
                href="/help"
                onClick={() => setMobileOpen(false)}
                className="block rounded px-3 py-2 text-sm hover:bg-muted"
              >
                Help &amp; Support
              </Link>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">{email}</span>
                <LogoutButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
