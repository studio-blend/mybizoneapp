import { DASHBOARD_VIEWS, DashboardAccessError } from '@/lib/dashboard-policy';
import { dashboardUrl } from '@/lib/dashboard-queries';
import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { permittedNavigation } from '@/lib/navigation';
import {
  type AnalysisSelection,
  type OperatingAnalysis,
  loadOperatingAnalysis,
} from '@/lib/operating-analysis';
import { requireUser } from '@/lib/session';
import Link from 'next/link';
import { ActivityChart } from '../_components/activity-chart';
import { DashboardControls } from '../_components/dashboard-controls';
import {
  AdjustmentAnalysis,
  AnalysisPanel,
  BillDetails,
  BusyHours,
  CollectionPriorities,
} from '../_components/operating-panels';
export const dynamic = 'force-dynamic';
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const change = (value: number, previous: number) =>
  previous === 0
    ? 'No prior-period baseline'
    : `${value > previous ? '+' : ''}${(((value - previous) / Math.abs(previous)) * 100).toFixed(1)}% vs previous period`;
export default async function OperatingAnalysisPage({
  searchParams,
}: { searchParams: Promise<AnalysisSelection> }) {
  const selection = await searchParams;
  const user = await requireUser();
  const roles = await getUserRoles(user);
  let data: OperatingAnalysis;
  try {
    data = await loadOperatingAnalysis(db, user.businessId, roles, selection);
  } catch (error) {
    if (!(error instanceof DashboardAccessError)) throw error;
    return (
      <div className="mx-auto max-w-2xl rounded-xl border p-8">
        <h1 className="text-xl font-semibold">Analysis access</h1>
        <p className="mt-3 text-muted-foreground">{error.message}</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-lg border px-4 py-2 text-sm">
          Return to your dashboard
        </Link>
      </div>
    );
  }
  const { access, period } = data;
  const activeSelection = {
    view: access.view,
    range: access.range,
    storeId: selection.storeId,
    departmentId: selection.departmentId,
  };
  const links = permittedNavigation(roles).flatMap((group) => group.items);
  const allowed = (path: string) => links.some((link) => link.href === path);
  const cards = data.hasSales
    ? [
        {
          label: 'Net billed sales',
          value: money(data.summary.revenue),
          detail: change(data.summary.revenue, data.previous.revenue),
        },
        ...(access.financial
          ? [
              {
                label: 'Gross profit',
                value: data.summary.profit === null ? '—' : money(data.summary.profit),
                detail:
                  data.summary.profit === null
                    ? `${data.summary.missingCosts} lines have no recorded cost`
                    : data.previous.profit === null
                      ? 'Previous period has missing costs'
                      : change(data.summary.profit, data.previous.profit),
              },
            ]
          : []),
        {
          label: 'Completed bills',
          value: data.summary.bills.toLocaleString('en-IN'),
          detail: 'Excludes estimates and returns',
        },
        {
          label: 'Returned billed value',
          value: money(data.summary.returns),
          detail: 'Includes GST; returns recorded in this period',
        },
      ]
    : [
        {
          label: 'Damage entries',
          value: String(
            data.adjustments.summary.find((row) => row.kind === 'damage')?.records ?? 0,
          ),
          detail: 'Recorded within your assigned scope',
        },
      ];
  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8" data-operating-view={access.view}>
      <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {DASHBOARD_VIEWS[access.view].label}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Operating analysis
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Explore trading patterns, collection priorities and the adjustments that affect your
            business.
          </p>
        </div>
        <Link
          href={dashboardUrl(activeSelection)}
          className="shrink-0 self-start rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to dashboard
        </Link>
      </header>
      <DashboardControls
        key={`${access.view}:${access.range}:${selection.storeId}:${selection.departmentId}`}
        action="/dashboard/analysis"
        views={access.views.filter((view) => view !== 'marketing')}
        stores={access.stores}
        departments={access.departments}
        selection={activeSelection}
      />
      <p className="text-xs text-muted-foreground">
        {period.label} ·{' '}
        {period.start.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
        })}
        –
        {new Date(period.end.getTime() - 1).toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
        })}{' '}
        · Dates and hours in India time · Customer balances are current
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0 rounded-xl border bg-card p-5">
            <dt className="text-xs font-medium text-muted-foreground">{card.label}</dt>
            <dd className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </dd>
            <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
          </div>
        ))}
      </dl>
      {data.hasSales && (
        <AnalysisPanel
          title="Sales and profit trends"
          description="Daily activity across your selected scope, with zero-activity days included. Previous-period totals cover the same number of calendar days."
        >
          <ActivityChart data={data.trend} showProfit={access.financial} />
        </AnalysisPanel>
      )}
      {data.hasCollections ? (
        <CollectionPriorities
          data={data}
          canOpenCustomers={allowed('/customers')}
          canRecord={allowed('/settlements')}
        />
      ) : (
        access.financial &&
        ['overview', 'accounts'].includes(access.view) && (
          <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Collection priorities use shared customer balances. Choose All assigned stores and clear
            department filters to see them.
          </p>
        )
      )}
      {data.hasSales && <BusyHours data={data} selection={activeSelection} />}
      {data.hasSales && (
        <BillDetails data={data} selection={activeSelection} canOpenSales={allowed('/sales')} />
      )}
      <AdjustmentAnalysis data={data} canOpenProducts={allowed('/products')} />
    </div>
  );
}
