import { BUSINESS_PROFILES, SELLING_MODELS } from '@/lib/business-profile';
import {
  DASHBOARD_VIEWS,
  DashboardAccessError,
  type DashboardSelection,
} from '@/lib/dashboard-policy';
import { dashboardUrl } from '@/lib/dashboard-queries';
import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { permittedNavigation } from '@/lib/navigation';
import { requireUser } from '@/lib/session';
import {
  type StockAttention,
  type WorkspaceDashboard,
  loadWorkspaceDashboard,
} from '@/lib/workspace-dashboard';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActivityChart } from './_components/activity-chart';
import { DashboardControls } from './_components/dashboard-controls';
import { OwnerInsights, StoreComparison } from './_components/owner-insights';

export const dynamic = 'force-dynamic';
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
const paymentLabels: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card_debit: 'Debit card',
  card_credit: 'Credit card',
  finance_emi: 'EMI',
  credit: 'Credit',
  cheque: 'Cheque',
  other: 'Other',
};

function Panel({
  title,
  description,
  children,
  id,
}: { title: string; description?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-32 flex-col justify-center rounded-lg border border-dashed px-5 py-6">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  accent,
}: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-5 ${accent ? 'border-emerald-700/20 bg-emerald-700/5' : 'bg-card'}`}
    >
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </dd>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function metrics(data: WorkspaceDashboard) {
  const { access, sales, inventory, ledger, customers } = data;
  const change =
    sales.previousRevenue === 0
      ? null
      : ((sales.revenue - sales.previousRevenue) / Math.abs(sales.previousRevenue)) * 100;
  const delta =
    change === null
      ? 'No prior-period comparison'
      : `${change > 0 ? '+' : ''}${change.toFixed(1)}% ${data.period.comparisonLabel}`;
  const revenue = {
    label: 'Net billed sales',
    value: money(sales.revenue),
    detail: delta,
    accent: true,
  };
  const profit = {
    label: 'Gross profit',
    value: sales.missingCosts ? '—' : money(sales.revenue - sales.tax - sales.cogs),
    detail: sales.missingCosts
      ? `${sales.missingCosts} line items have no recorded cost`
      : 'After returns and product costs; excludes GST and expenses',
  };
  const orders = {
    label: 'Sales bills',
    value: number(sales.orders),
    detail: 'Completed sales; estimates excluded',
  };
  const average = {
    label: 'Average bill',
    value: money(sales.orders ? (sales.revenue + sales.returns) / sales.orders : 0),
    detail: 'Billed sales before returns',
  };
  const alerts = {
    label: 'Stock alerts',
    value: number(inventory.low + inventory.out),
    detail: `${number(inventory.low)} low stock · ${number(inventory.out)} out of stock`,
  };
  if (access.view === 'marketing')
    return [
      {
        label: 'Customers',
        value: number(customers?.total ?? 0),
        detail: 'Customer directory',
        accent: true,
      },
      { label: 'New customers', value: number(customers?.new ?? 0), detail: data.period.label },
      {
        label: 'Tagged customers',
        value: number(customers?.tagged ?? 0),
        detail: 'Ready for customer segments',
      },
      {
        label: 'Without tags',
        value: number((customers?.total ?? 0) - (customers?.tagged ?? 0)),
        detail: 'Customers to organize',
      },
    ];
  if (access.view === 'inventory')
    return [
      {
        label: 'Active products',
        value: number(inventory.products),
        detail: 'Within the selected scope',
        accent: true,
      },
      {
        label: 'In stock',
        value: number(inventory.products - inventory.out),
        detail: 'Products with available stock',
      },
      {
        label: 'Low stock',
        value: number(inventory.low),
        detail: 'Below the configured reorder level',
      },
      {
        label: 'Out of stock',
        value: number(inventory.out),
        detail: 'Products needing replenishment',
      },
    ];
  if (access.view === 'accounts')
    return [
      revenue,
      profit,
      {
        label: 'Expenses',
        value: ledger ? money(ledger.expenses) : '—',
        detail: ledger ? data.period.label : 'Select all stores for shared expenses',
      },
      {
        label: 'Customer dues',
        value: ledger ? money(ledger.receivables) : '—',
        detail: ledger
          ? 'Current customer ledger balance'
          : 'Select all stores for shared balances',
      },
    ];
  if (access.view === 'sales')
    return [
      revenue,
      orders,
      average,
      {
        label: 'Customers served',
        value: number(sales.customers),
        detail: 'Linked customers in this period',
      },
    ];
  if (access.view === 'billing')
    return [
      revenue,
      orders,
      average,
      {
        label: 'Unsettled bills',
        value: number(sales.unsettled),
        detail: 'Due or partially paid; not a debt amount',
      },
    ];
  if (access.view === 'operations')
    return [
      revenue,
      access.financial
        ? profit
        : { label: 'Quantity sold', value: number(sales.units), detail: 'Includes free items' },
      orders,
      alerts,
    ];
  return [
    revenue,
    profit,
    {
      label: 'Customer dues',
      value: ledger ? money(ledger.receivables) : '—',
      detail: ledger
        ? 'Current balance across the business'
        : 'Shared ledger available in All stores',
    },
    alerts,
  ];
}

function StockTable({
  rows,
  canOpenProducts,
}: { rows: StockAttention[]; canOpenProducts: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Product stock within your dashboard scope</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="pb-3 text-left font-medium">Product</th>
            <th className="pb-3 text-right font-medium">Available</th>
            <th className="pb-3 pl-4 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-3 pr-4">
                <p className="font-medium">
                  {canOpenProducts ? (
                    <Link
                      href={`/products?q=${encodeURIComponent(row.name)}`}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    row.name
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{row.department ?? row.store}</p>
              </td>
              <td className="whitespace-nowrap py-3 text-right tabular-nums">
                {number(row.inventory)} {row.unit}
                <p className="mt-1 text-xs text-muted-foreground">Min {number(row.minimum)}</p>
              </td>
              <td className="py-3 pl-4 text-right">
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${row.inventory <= 0 ? 'bg-red-700/10 text-red-700 dark:text-red-300' : row.inventory < row.minimum ? 'bg-amber-700/10 text-amber-800 dark:text-amber-300' : 'bg-emerald-700/10 text-emerald-800 dark:text-emerald-300'}`}
                >
                  {row.inventory <= 0
                    ? 'Out of stock'
                    : row.inventory < row.minimum
                      ? 'Low stock'
                      : 'In stock'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<DashboardSelection> }) {
  const selection = await searchParams;
  const user = await requireUser();
  const roles = await getUserRoles(user);
  let data: WorkspaceDashboard;
  try {
    data = await loadWorkspaceDashboard(db, user.businessId, roles, selection);
  } catch (error) {
    if (!(error instanceof DashboardAccessError)) throw error;
    return (
      <div className="mx-auto max-w-2xl rounded-xl border p-8">
        <h1 className="text-xl font-semibold">Dashboard access</h1>
        <p className="mt-3 text-muted-foreground">{error.message}</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-lg border px-4 py-2 text-sm">
          Return to your dashboard
        </Link>
      </div>
    );
  }
  const { access, period } = data;
  const priority = data.profile.mixed
    ? null
    : data.profile.sellingModel !== 'retail'
      ? 'collections'
      : BUSINESS_PROFILES[data.profile.businessProfile].priority;
  const links = permittedNavigation(roles).flatMap((group) => group.items);
  const allowed = (path: string) => links.some((link) => link.href === path);
  const preferences: Record<string, string[]> = {
    overview: ['/sales/new', '/reports', '/stores', '/team'],
    operations: ['/sales/new', '/sales', '/products'],
    sales: ['/sales/new', '/sales'],
    billing: ['/sales/new', '/sales', '/settlements'],
    inventory: ['/products', '/purchases', '/damage-logs'],
    accounts: ['/settlements', '/expenses', '/reports/pl', '/reports/due-bills'],
    marketing: ['/customers', '/cms'],
  };
  const actionPreferences =
    priority === 'collections' && ['overview', 'accounts', 'operations'].includes(access.view)
      ? ['/settlements', '/reports/due-bills', ...(preferences[access.view] ?? [])]
      : (preferences[access.view] ?? []);
  const actions = [...new Set(actionPreferences)].flatMap((href) =>
    links.filter((link) => link.href === href),
  );
  const selectedStore = access.stores.find((store) => store.id === selection.storeId);
  const selectedDepartment = access.departments.find(
    (department) => department.id === selection.departmentId,
  );
  const scopeLabel =
    access.view === 'marketing'
      ? 'Business customer directory'
      : [
          selectedDepartment?.name ??
            (access.departmentOnly && access.departments.length === 1
              ? access.departments[0]?.name
              : null),
          selectedStore?.name ??
            (access.stores.length === 1
              ? access.stores[0]?.name
              : `${access.stores.length} stores`),
        ]
          .filter(Boolean)
          .join(' · ');
  const activeSelection = { ...selection, view: access.view, range: access.range };
  const noSales = data.sales.orders === 0 && data.sales.returns === 0;
  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8" data-dashboard-view={access.view}>
      <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {DASHBOARD_VIEWS[access.view].label}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {DASHBOARD_VIEWS[access.view].description}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {user.name} <span aria-hidden="true">·</span> {scopeLabel || 'Your assigned scope'}
          </p>
          {access.view !== 'marketing' && (
            <p className="mt-2 text-xs text-muted-foreground" data-business-profile>
              {data.profile.mixed
                ? 'Mixed store profiles · Each store uses its own stock review period'
                : `${BUSINESS_PROFILES[data.profile.businessProfile].label} · ${SELLING_MODELS[data.profile.sellingModel]} · Slow-stock review: ${BUSINESS_PROFILES[data.profile.businessProfile].slowDays} days`}
            </p>
          )}
          {!data.profile.mixed && ['overview', 'operations'].includes(access.view) && (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {BUSINESS_PROFILES[data.profile.businessProfile].focus}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {access.view !== 'marketing' && (
            <Link
              href={dashboardUrl(activeSelection, true)}
              className="rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Operating analysis
            </Link>
          )}
          {actions.slice(0, 2).map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 ${index === 0 ? 'bg-primary text-primary-foreground' : 'border bg-card'}`}
            >
              {action.label}
            </Link>
          ))}
          {access.departmentOnly && (
            <a href="#stock-on-hand" className="rounded-lg border px-4 py-2 text-sm font-medium">
              Review department stock
            </a>
          )}
        </div>
      </header>
      <DashboardControls
        key={`${access.view}:${selection.storeId}:${selection.departmentId}:${access.range}`}
        views={access.views}
        stores={access.view === 'marketing' ? [] : access.stores}
        departments={access.view === 'marketing' ? [] : access.departments}
        selection={activeSelection}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {period.label} <span aria-hidden="true">·</span> {date(period.start.toISOString())} –{' '}
          {date(new Date(period.end.getTime() - 1).toISOString())}
        </p>
        <p>Dates in India time · Stock and balances are current</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics(data).map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </dl>

      {access.view === 'marketing' ? (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Panel
            title="Customer segments"
            description="Customers can belong to more than one segment."
          >
            {data.customers?.segments.length ? (
              <ul className="divide-y">
                {data.customers.segments.map((segment) => (
                  <li key={segment.name} className="flex items-center justify-between py-4">
                    <span className="text-sm font-medium">{segment.name}</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-sm tabular-nums">
                      {number(segment.count)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Organize your customer directory">
                Add tags to customers to build useful segments for follow-ups.
              </Empty>
            )}
          </Panel>
          <Panel
            title="Latest follow-ups"
            description="Most recent notes across your customer directory."
          >
            {data.customers?.notes.length ? (
              <ul className="divide-y">
                {data.customers.notes.map((note, index) => (
                  <li key={`${note.name}:${note.date}:${index}`} className="py-3">
                    <p className="text-sm font-medium">{note.name}</p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{note.note}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{date(note.date)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No follow-up notes yet">
                Record a note on a customer to keep the next conversation informed.
              </Empty>
            )}
          </Panel>
          <div className="lg:col-span-2">
            <Panel title="Recent customers" description="Latest additions, across all dates.">
              {data.customers?.recent.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.customers.recent.map((customer) => (
                    <li key={customer.id} className="rounded-lg border p-4">
                      <p className="text-sm font-medium">{customer.name}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {customer.tier} · Added {date(customer.date)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Start with your first customer">
                  The customer directory will appear here once records are added.
                </Empty>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <>
          {access.view !== 'inventory' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                title="Sales activity"
                description={`Daily net sales after returns · ${period.label.toLowerCase()}. Estimates are excluded.`}
              >
                {noSales ? (
                  <Empty title="No sales in this period">
                    Choose a longer period
                    {allowed('/sales/new') ? ' or record your first sale' : ''} to see activity
                    here.
                  </Empty>
                ) : (
                  <ActivityChart data={data.trend} showProfit={access.financial} />
                )}
              </Panel>
              <Panel title="Needs attention" description="Priorities within your selected scope.">
                <ul className="space-y-3">
                  {data.inventory.low + data.inventory.out > 0 && (
                    <li className="rounded-lg border p-4">
                      <p className="text-sm font-medium">
                        {number(data.inventory.low + data.inventory.out)} stock alerts
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Review stock availability before the next sale.
                      </p>
                      <a
                        href="#stock-attention"
                        className="mt-3 inline-block text-xs font-medium underline underline-offset-4"
                      >
                        Review stock
                      </a>
                    </li>
                  )}
                  {data.insights.slow.length > 0 && (
                    <li className="rounded-lg border p-4">
                      <p className="text-sm font-medium">Slow stock to review</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Available products have passed their store’s no-sale review period.
                      </p>
                      <a
                        href="#slow-stock"
                        className="mt-3 inline-block text-xs font-medium underline underline-offset-4"
                      >
                        Review slow stock
                      </a>
                    </li>
                  )}
                  {data.sales.unsettled > 0 && (
                    <li className="rounded-lg border p-4">
                      <p className="text-sm font-medium">
                        {number(data.sales.unsettled)} unsettled bills
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {number(data.sales.overdue)} past their due date, across all dates.
                        Collections are recorded in customer ledgers.
                      </p>
                      {allowed('/reports/due-bills') && (
                        <Link
                          href="/reports/due-bills"
                          className="mt-3 inline-block text-xs font-medium underline underline-offset-4"
                        >
                          Review due bills
                        </Link>
                      )}
                    </li>
                  )}
                  {data.ledger && data.ledger.emiOverdue > 0 && (
                    <li className="rounded-lg border p-4">
                      <p className="text-sm font-medium">
                        {number(data.ledger.emiOverdue)} overdue instalments
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Unpaid EMI instalments due before today, across all dates.
                      </p>
                      {allowed('/emi') && (
                        <Link
                          href="/emi"
                          className="mt-3 inline-block text-xs font-medium underline underline-offset-4"
                        >
                          Open EMI schedules
                        </Link>
                      )}
                    </li>
                  )}
                </ul>
                {data.inventory.low + data.inventory.out === 0 &&
                  data.sales.unsettled === 0 &&
                  data.insights.slow.length === 0 &&
                  !data.ledger?.emiOverdue && (
                    <Empty title="No alerts in this view">
                      Stock and bill checks found no items needing attention in the selected scope.
                    </Empty>
                  )}
              </Panel>
            </div>
          )}

          {data.ledger && (
            <Panel
              title="Business ledger"
              description="Customer and supplier balances are shared across the business. Payment totals use the selected period."
            >
              <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Customer receivables', data.ledger.receivables],
                  ['Supplier payables', data.ledger.payables],
                  ['General customer settlements', data.ledger.collections],
                  ['Supplier payments', data.ledger.supplierPayments],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-2 text-xl font-semibold tabular-nums">
                      {money(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
              {data.funds && (
                <div className="mt-6 border-t pt-4">
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ['Customer advances held', data.funds.customerAdvances],
                      ['Supplier advances prepaid', data.funds.supplierAdvances],
                      ['Customer refunds payable', data.funds.customerRefunds],
                      ['Supplier refunds receivable', data.funds.supplierRefunds],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-2 text-lg font-semibold tabular-nums">
                          {money(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <a href="/settlements/funds" className="mt-3 inline-block text-xs underline">
                    Resolve advances and refunds
                  </a>
                </div>
              )}
              {data.money && (
                <div className="mt-6 border-t pt-4">
                  <h3 className="text-sm font-medium">Cash &amp; bank · current position</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!data.money.accounts.length
                      ? 'Set up verified opening balances to see account positions.'
                      : data.money.ready
                        ? 'Recorded sources reconciled. Confirm balances against cash counts and bank statements.'
                        : `${data.money.unassigned.length} unassigned money sources · ${data.money.stale.length} changed sources. Account amounts remain provisional.`}
                  </p>
                  <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                    {data.money.accounts.map((a) => (
                      <div key={a.id}>
                        <dt className="text-xs text-muted-foreground">
                          {a.name} · recorded cleared
                        </dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums">
                          {money(Number(a.cleared))}
                        </dd>
                        <p className="text-xs text-muted-foreground">
                          Reserved outgoing {money(Number(a.pending_out))} · pending incoming{' '}
                          {money(Number(a.pending_in))}
                        </p>
                      </div>
                    ))}
                  </dl>
                  <a href="/money" className="mt-3 inline-block text-xs underline">
                    Manage cash &amp; bank clearing
                  </a>
                </div>
              )}
              {actions.length > 2 && (
                <div className="mt-6 flex flex-wrap gap-3 border-t pt-4">
                  {actions.slice(2).map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="text-xs font-medium underline underline-offset-4"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}
          {access.financial && !data.ledger && ['overview', 'accounts'].includes(access.view) && (
            <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Store and department filters show their sales performance. Choose All stores to view
              shared customer balances, supplier balances and expenses.
            </p>
          )}

          {(access.view === 'inventory' || access.departmentOnly) && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                id="stock-on-hand"
                title="Stock on hand"
                description="Current quantities in your scope, with shortages first. Showing up to eight products."
              >
                {data.stock.length ? (
                  <StockTable rows={data.stock} canOpenProducts={allowed('/products')} />
                ) : (
                  <Empty title="No products in this scope">
                    Products assigned to your store or department will appear here.
                  </Empty>
                )}
              </Panel>
              <Panel
                title="Inventory movements"
                description={`${period.label} · Latest receipts and damage entries.`}
              >
                {data.movements.length ? (
                  <ul className="divide-y">
                    {data.movements.map((movement, index) => (
                      <li
                        key={`${movement.name}:${movement.date}:${index}`}
                        className="flex gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{movement.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {movement.kind} · {date(movement.date)}
                          </p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {movement.quantity > 0 ? '+' : ''}
                          {number(movement.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No recent stock movements">
                    Receipts and damage entries within this scope appear here.
                  </Empty>
                )}
              </Panel>
            </div>
          )}

          {['overview', 'operations'].includes(access.view) && data.performance.length > 1 && (
            <StoreComparison data={data} />
          )}
          {['overview', 'operations', 'accounts', 'inventory'].includes(access.view) && (
            <OwnerInsights
              data={data}
              canOpenProducts={allowed('/products')}
              canOpenBatches={allowed('/inventory/batches')}
              canOpenSerials={allowed('/inventory/serials')}
              canOpenOrders={allowed('/orders')}
            />
          )}

          {access.view !== 'inventory' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                title={access.departmentOnly ? 'Department sales activity' : 'Recent bills'}
                description={
                  access.departmentOnly
                    ? 'Only your department’s line items are included; full mixed bills stay restricted.'
                    : 'Latest completed sales in the selected period. Up to six bills.'
                }
              >
                {data.recent.length ? (
                  <ul className="divide-y">
                    {data.recent.map((bill, index) => (
                      <li key={bill.id ?? `${bill.date}:${index}`} className="flex gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium">
                            {bill.id && allowed('/sales') ? (
                              <Link href={`/sales/${bill.id}`} className="hover:underline">
                                {bill.number}
                              </Link>
                            ) : (
                              (bill.number ?? 'Department sale')
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {date(bill.date)} · {bill.customer ?? bill.store}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums">{money(bill.total)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {paymentLabels[bill.method] ?? bill.method} · {bill.status}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title={
                      access.view === 'accounts'
                        ? 'Open detailed financial reports'
                        : 'No recent bills'
                    }
                  >
                    {access.view === 'accounts'
                      ? 'Use the reports and ledger links to review transactions and balances.'
                      : 'Bills in this period will appear here as sales are recorded.'}
                  </Empty>
                )}
              </Panel>
              <Panel
                title="Payment method mix"
                description="Billed amounts before returns. These are sales methods, not collected cash."
              >
                {data.methods.length ? (
                  <ul className="divide-y">
                    {data.methods.map((method) => (
                      <li
                        key={method.method}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <span className="text-sm">
                          {paymentLabels[method.method] ?? method.method}
                        </span>
                        <span className="text-sm font-medium tabular-nums">
                          {money(method.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No payment mix yet">
                    Payment methods appear when there are sales in this period.
                  </Empty>
                )}
              </Panel>
            </div>
          )}

          <Panel
            id="stock-attention"
            title="Stock attention"
            description="Current shortages, independent of the selected sales period."
          >
            {data.attention.length ? (
              <StockTable rows={data.attention} canOpenProducts={allowed('/products')} />
            ) : (
              <Empty title="No stock shortages">
                No active products in this scope are out of stock or below their reorder level.
              </Empty>
            )}
            {access.financial && (
              <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                Current stock value at recorded costs:{' '}
                <span className="font-medium text-foreground">{money(data.inventory.value)}</span>
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
