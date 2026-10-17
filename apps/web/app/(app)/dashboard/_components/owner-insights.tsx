import { BUSINESS_PROFILES } from '@/lib/business-profile';
import type { WorkspaceDashboard } from '@/lib/workspace-dashboard';
import Link from 'next/link';
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const quantity = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const panel = 'min-w-0 rounded-xl border bg-card p-5 sm:p-6';
const subtitle = 'mt-1 text-xs leading-relaxed text-muted-foreground';

export function OwnerInsights({
  data,
  canOpenProducts,
  canOpenBatches,
  canOpenSerials,
  canOpenOrders,
}: {
  data: WorkspaceDashboard;
  canOpenProducts: boolean;
  canOpenBatches: boolean;
  canOpenSerials: boolean;
  canOpenOrders: boolean;
}) {
  const { insights, access, profile } = data;
  const product = (id: string | null, name: string) =>
    id && canOpenProducts ? (
      <Link
        href={`/products?q=${encodeURIComponent(name)}`}
        className="font-medium hover:underline"
      >
        {name}
      </Link>
    ) : (
      <span className="font-medium">{name}</span>
    );
  const maxProfit = Math.max(1, ...insights.profit.map((row) => Math.abs(row.profit ?? 0)));
  const cards = {
    profit: access.financial ? (
      <section className={panel} key="profit">
        <h2 className="text-base font-semibold tracking-tight">Product profitability</h2>
        <p className={subtitle}>
          Top six by gross profit in this period, excluding GST, after returns and free-item costs.
          Missing costs are not estimated.
        </p>
        {insights.profit.length ? (
          <ul className="mt-4 divide-y">
            {insights.profit.map((row, index) => (
              <li key={`${row.id}:${index}`} className="py-4">
                <div className="flex items-start justify-between gap-4 text-sm">
                  <div className="min-w-0 break-words">{product(row.id, row.name)}</div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {row.profit === null ? 'Cost missing' : money(row.profit)}
                  </span>
                </div>
                {row.profit !== null && (
                  <div className="mt-2 h-1.5 rounded bg-muted" aria-hidden="true">
                    <div
                      className={`h-full rounded ${row.profit < 0 ? 'bg-red-700' : 'bg-emerald-700'}`}
                      style={{ width: `${(Math.abs(row.profit) / maxProfit) * 100}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Net sales {money(row.revenue)} ·{' '}
                  {row.profit === null
                    ? `${row.missingCosts} lines without cost snapshots`
                    : row.revenue > 0
                      ? `${((row.profit / row.revenue) * 100).toFixed(1)}% margin`
                      : 'Margin unavailable for non-positive net sales'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Complete a sale with recorded product costs to compare product profitability.
          </p>
        )}
      </section>
    ) : null,
    stock: (
      <section className={panel} key="stock" id="slow-stock">
        <h2 className="text-base font-semibold tracking-tight">Slow stock</h2>
        <p className={subtitle}>
          Available products with no sale for their profile’s review period.{' '}
          {profile.mixed
            ? 'Each store uses its own threshold.'
            : 'Threshold follows the selected business profile.'}{' '}
          Up to six products, longest idle first.
        </p>
        {insights.slow.length ? (
          <ul className="mt-4 divide-y">
            {insights.slow.map((row) => (
              <li key={row.id} className="py-4">
                <div className="flex items-start justify-between gap-4 text-sm">
                  <div className="min-w-0 break-words">
                    {product(row.id, row.name)}
                    <p className="mt-1 text-xs text-muted-foreground">{row.store}</p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">{row.idleDays} days</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {quantity(row.inventory)} {row.unit} available ·{' '}
                  {row.lastSale
                    ? 'Since last completed sale'
                    : 'No recorded sale since product creation'}{' '}
                  · Review after {row.slowDays} days
                </p>
                {access.financial && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stock at current recorded cost:{' '}
                    {row.value === null ? 'Cost unavailable' : money(row.value)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            No products meet the slow-stock threshold. New products get time to establish a sales
            history.
          </p>
        )}
      </section>
    ),
  };
  const priority = profile.mixed
    ? 'profit'
    : profile.sellingModel !== 'retail'
      ? 'collections'
      : BUSINESS_PROFILES[profile.businessProfile].priority;
  const stockFirst = priority === 'stock';
  return (
    <div className="space-y-5" data-dashboard-insights>
      {(data.orderInsights.attention.length > 0 ||
        (data.orderInsights.money &&
          Object.values(data.orderInsights.money).some((value) => Number(value) !== 0))) && (
        <section className={panel}>
          <h2 className="text-base font-semibold tracking-tight">Orders awaiting handover</h2>
          <p className={subtitle}>
            Current order lines still to hand over, earliest promised date first. Orders do not
            reserve stock. Up to six orders in your scope.
          </p>
          {data.orderInsights.money && (
            <dl className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                ['Unused advances', data.orderInsights.money.held],
                ['Delivered bills due', data.orderInsights.money.due],
                ['Order receipts · this period', data.orderInsights.money.received],
                ['Order refunds · this period', data.orderInsights.money.refunds],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-2 break-words text-lg font-semibold tabular-nums">
                    {money(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <ul className="mt-4 divide-y">
            {data.orderInsights.attention.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <div>
                  {canOpenOrders ? (
                    <Link className="font-medium underline" href={`/orders/${row.id}`}>
                      {row.orderNo}
                    </Link>
                  ) : (
                    <p className="font-medium">{row.orderNo}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{row.store}</p>
                </div>
                <p className="text-xs">
                  {row.promisedOn} · {row.units} lines remaining
                </p>
              </li>
            ))}
          </ul>
          {canOpenOrders && (
            <Link href="/orders?view=pending" className="mt-3 inline-block text-sm underline">
              Review customer orders
            </Link>
          )}
        </section>
      )}
      {insights.serials.length > 0 && (
        <section className={panel}>
          <h2 className="text-base font-semibold tracking-tight">
            Serial units awaiting inspection
          </h2>
          <p className={subtitle}>
            Current quarantined units in your selected scope. These remain physical stock and cannot
            be sold until inspected. Up to six products, oldest receipts first.
          </p>
          <ul className="mt-4 divide-y">
            {insights.serials.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0 break-words">
                  <p className="font-medium">{row.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.store}</p>
                </div>
                <span className="shrink-0 tabular-nums">{row.quantity} pc</span>
              </li>
            ))}
          </ul>
          {canOpenSerials && (
            <Link
              className="mt-3 inline-block text-sm underline"
              href="/inventory/serials?state=quarantine"
            >
              Inspect quarantined serials
            </Link>
          )}
        </section>
      )}
      {insights.batches.length > 0 && (
        <section className={panel}>
          <h2 className="text-base font-semibold tracking-tight">Expiry & quarantine</h2>
          <p className={subtitle}>
            Current physical lots in the selected scope, independent of the sales date filter.
            Expired and quarantined lots are blocked at checkout. Up to six lots, most urgent first.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            {[
              ['Blocked by expiry', insights.batches[0]?.expiredLots],
              ['Quarantined', insights.batches[0]?.quarantineLots],
              ['Expiry in 30 days', insights.batches[0]?.soonLots],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-3 divide-y">
            {insights.batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <div className="min-w-0 break-words">
                  <p className="font-medium">{batch.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {batch.store} · {batch.code} · {batch.expiresOn ?? 'Expiry unverified'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {quantity(batch.quantity)} {batch.unit}
                  </p>
                  <p className="mt-1 text-xs">
                    {batch.status === 'expired'
                      ? 'Blocked by expiry'
                      : batch.status === 'quarantine'
                        ? 'Quarantined'
                        : 'Expires soon'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {canOpenBatches && (
            <Link
              className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
              href="/inventory/batches"
            >
              Review batches & expiry
            </Link>
          )}
        </section>
      )}
      <div className={`grid gap-5 ${access.financial ? 'lg:grid-cols-2' : ''}`}>
        {stockFirst ? [cards.stock, cards.profit] : [cards.profit, cards.stock]}
      </div>
      <details className={panel}>
        <summary className="cursor-pointer text-sm font-semibold">Stock cover estimates</summary>
        <p className={`${subtitle} mt-3`}>
          Current quantity divided by average daily units sold over up to 30 calendar days,
          including free items. At least 14 days of product history and a sale are required. This
          rough estimate does not adjust for stockout days, returns or seasonal demand. Independent
          of the activity filter.
        </p>
        {insights.cover.length ? (
          <ul className="mt-4 divide-y">
            {insights.cover.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0 break-words">
                  {product(row.id, row.name)}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.store} · {quantity(row.inventory)} {row.unit}
                  </p>
                </div>
                <span className="shrink-0 text-right font-medium tabular-nums">
                  ~{quantity(row.daysRemaining ?? 0)} days
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Insufficient sales history to estimate stock cover.
          </p>
        )}
      </details>
    </div>
  );
}

export function StoreComparison({ data }: { data: WorkspaceDashboard }) {
  const maximum = Math.max(1, ...data.performance.map((row) => Math.abs(row.revenue)));
  return (
    <section className={panel}>
      <h2 className="text-base font-semibold tracking-tight">Store comparison</h2>
      <p className={subtitle}>
        Net billed sales after returns, with equal-length previous-period comparisons. Gross profit
        and margins exclude GST. Up to twenty stores.
      </p>
      <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {data.performance.map((row) => (
          <li key={row.id}>
            <div className="flex justify-between gap-3 text-sm">
              <Link
                href={`/dashboard?view=${data.access.view}&range=${data.access.range}&storeId=${row.id}`}
                className="min-w-0 break-words font-medium hover:underline"
              >
                {row.name}
              </Link>
              <span className="shrink-0 font-semibold tabular-nums">{money(row.revenue)}</span>
            </div>
            <div className="mt-2 h-2 rounded bg-muted" aria-hidden="true">
              <div
                className={`h-full rounded ${row.revenue < 0 ? 'bg-red-700' : 'bg-emerald-700'}`}
                style={{ width: `${(Math.abs(row.revenue) / maximum) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {row.orders} bills ·{' '}
              {row.previousRevenue !== 0
                ? `${(((row.revenue - row.previousRevenue) / Math.abs(row.previousRevenue)) * 100).toFixed(1)}% vs previous period`
                : 'No prior-period baseline'}
            </p>
            {data.access.financial && (
              <p className="mt-1 text-xs text-muted-foreground">
                {row.profit === null
                  ? 'Gross profit unavailable: cost snapshots missing'
                  : `Gross profit ${money(row.profit)}${row.revenue - row.tax > 0 ? ` · ${((row.profit / (row.revenue - row.tax)) * 100).toFixed(1)}% margin` : ''}`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
