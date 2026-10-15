import { dashboardUrl } from '@/lib/dashboard-queries';
import type { AnalysisSelection, OperatingAnalysis } from '@/lib/operating-analysis';
import Link from 'next/link';
import type { ReactNode } from 'react';
export const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const hours = Array.from({ length: 24 }, (_, hour) => hour);
export function AnalysisPanel({
  title,
  description,
  children,
  id,
}: { title: string; description: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
export function BusyHours({
  data,
  selection,
}: { data: OperatingAnalysis; selection: AnalysisSelection }) {
  const bySlot = new Map(data.busy.map((row) => [`${row.weekday}:${row.hour}`, row]));
  const rate = (row: OperatingAnalysis['busy'][number]) =>
    row.bills / (data.occurrences[row.weekday - 1] || 1);
  const sorted = [...data.busy].sort(
    (a, b) => rate(b) - rate(a) || b.bills - a.bills || a.weekday - b.weekday || a.hour - b.hour,
  );
  const peak = sorted[0];
  const maximum = peak ? rate(peak) : 1;
  const url = (weekday: number, hour: number) =>
    `${dashboardUrl(selection, true)}&weekday=${weekday}&hour=${hour}#bill-details`;
  return (
    <AnalysisPanel
      title="Busy hours"
      description="Average completed bills per calendar weekday occurrence, in India time. Estimates and returns are excluded. Closed days are not tracked; today may be partial. Select a coloured slot to review its bills."
    >
      {peak ? (
        <p className="mb-4 text-sm">
          <span className="font-medium">Busiest recorded slot:</span> {weekdays[peak.weekday - 1]}{' '}
          {String(peak.hour).padStart(2, '0')}:00 · {number(rate(peak))} bills per calendar{' '}
          {weekdays[peak.weekday - 1]}
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          No completed bills in this period. Choose a longer period to see trading patterns.
        </p>
      )}
      <section
        className="max-w-full overflow-x-auto rounded-lg border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the hourly table.
        tabIndex={0}
        aria-label="Hourly bill-count heatmap, scroll horizontally for all hours"
      >
        <table className="w-full min-w-[740px] border-separate border-spacing-1 text-xs">
          <caption className="sr-only">
            Average bills by weekday and hour. A dash means the weekday is outside the selected
            period.
          </caption>
          <thead>
            <tr>
              <th className="w-16 text-left font-medium">Day / hour</th>
              {hours.map((hour) => (
                <th key={hour} className="py-2 text-center font-normal text-muted-foreground">
                  {String(hour).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdays.map((day, index) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-left font-medium">
                  {day.slice(0, 3)}
                </th>
                {hours.map((hour) => {
                  const row = bySlot.get(`${index + 1}:${hour}`);
                  const average = row ? rate(row) : 0;
                  const occurs = data.occurrences[index] ?? 0;
                  const active = data.slot.weekday === index + 1 && data.slot.hour === hour;
                  return (
                    <td key={hour} className="text-center">
                      <div
                        className={`flex h-7 min-w-5 items-center justify-center rounded ${active ? 'ring-2 ring-emerald-700 ring-offset-1' : ''}`}
                        style={{
                          backgroundColor:
                            average > 0
                              ? `rgba(4,120,87,${0.12 + (average / maximum) * 0.55})`
                              : undefined,
                        }}
                      >
                        {row ? (
                          <a
                            href={url(index + 1, hour)}
                            className="flex h-full w-full items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            aria-label={`${day} ${String(hour).padStart(2, '0')}:00, ${row.bills} bills, ${number(average)} per calendar occurrence`}
                            title={`${row.bills} bills · ${money(row.revenue)} billed · ${occurs} calendar occurrences`}
                          >
                            {number(average)}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{occurs ? '0' : '—'}</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Scroll sideways to view all 24 hours. Darker cells indicate more bills per calendar
        occurrence. This measures checkout activity, not footfall or staffing productivity.
      </p>
      {data.busy.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer font-medium">View busy-hour data</summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.busy.map((row) => (
              <li key={`${row.weekday}:${row.hour}`}>
                {weekdays[row.weekday - 1]} {String(row.hour).padStart(2, '0')}:00 — {row.bills}{' '}
                bills over {data.occurrences[row.weekday - 1]} calendar occurrences ·{' '}
                {money(row.revenue)} billed
              </li>
            ))}
          </ul>
        </details>
      )}
    </AnalysisPanel>
  );
}
export function BillDetails({
  data,
  selection,
  canOpenSales,
}: { data: OperatingAnalysis; selection: AnalysisSelection; canOpenSales: boolean }) {
  return (
    <AnalysisPanel
      id="bill-details"
      title="Bills behind the pattern"
      description="Up to ten latest completed bills for the selected weekday and hour. These filters affect this list; charts and totals retain the selected activity period."
    >
      <form
        method="get"
        action="/dashboard/analysis#bill-details"
        className="mb-5 flex flex-wrap items-end gap-3"
        aria-label="Bill pattern filters"
      >
        {(['view', 'range', 'storeId', 'departmentId'] as const).map((key) =>
          selection[key] ? (
            <input key={key} type="hidden" name={key} value={selection[key]} />
          ) : null,
        )}
        <label className="min-w-0 text-xs font-medium">
          Weekday
          <select
            name="weekday"
            defaultValue={data.slot.weekday ?? ''}
            className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All weekdays</option>
            {weekdays.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-medium">
          Hour
          <select
            name="hour"
            defaultValue={data.slot.hour ?? ''}
            className="mt-1 block rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All hours</option>
            {hours.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00–{String(hour).padStart(2, '0')}:59
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Review bills
        </button>
        {(data.slot.weekday !== null || data.slot.hour !== null) && (
          <a
            href={`${dashboardUrl(selection, true)}#bill-details`}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Clear time filters
          </a>
        )}
      </form>
      {data.bills.length ? (
        <ul className="divide-y">
          {data.bills.map((row, index) => (
            <li
              key={row.id ?? `${row.date}:${index}`}
              className="flex justify-between gap-4 py-3 text-sm"
            >
              <div className="min-w-0 break-words">
                {row.id && canOpenSales ? (
                  <Link href={`/sales/${row.id}`} className="font-medium hover:underline">
                    {row.number}
                  </Link>
                ) : (
                  <p className="font-medium">{row.number ?? 'Department sale'}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.date).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {row.store}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{money(row.revenue)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No bills match these time filters. Try another hour or weekday.
        </p>
      )}
      {data.access.departmentOnly && (
        <p className="mt-3 text-xs text-muted-foreground">
          Only assigned department lines are counted. Full mixed-bill identifiers stay restricted.
        </p>
      )}
    </AnalysisPanel>
  );
}
export function CollectionPriorities({
  data,
  canOpenCustomers,
  canRecord,
}: { data: OperatingAnalysis; canOpenCustomers: boolean; canRecord: boolean }) {
  return (
    <AnalysisPanel
      title="Collection priorities"
      description="Up to eight customers ranked by current outstanding balance, across all dates. Recent collection dates are context, not invoice ageing. General collections are not allocated to individual bills."
    >
      {data.collections.length ? (
        <ul className="divide-y">
          {data.collections.map((row) => (
            <li key={row.id} className="py-4">
              <div className="flex justify-between gap-4 text-sm">
                <div className="min-w-0 break-words">
                  {canOpenCustomers ? (
                    <Link href={`/customers/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                  ) : (
                    <p className="font-medium">{row.name}</p>
                  )}
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(row.balance)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {row.lastCollection
                  ? `Last recorded collection ${new Date(row.lastCollection).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'No collection recorded'}
                {row.creditLimit > 0 ? ` · Recorded credit limit ${money(row.creditLimit)}` : ''}
              </p>
              {row.creditLimit > 0 && row.balance > row.creditLimit && (
                <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                  Above recorded credit limit by {money(row.balance - row.creditLimit)}
                </p>
              )}
              {canRecord && (
                <Link
                  href={`/settlements?tab=sales&customerId=${row.id}`}
                  className="mt-3 inline-block text-xs font-medium underline underline-offset-4"
                >
                  Record collection for {row.name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No positive customer balances to follow up.</p>
      )}
    </AnalysisPanel>
  );
}
const adjustmentLabels = {
  discount: 'Discounts',
  free: 'Free items',
  return: 'Returns',
  damage: 'Damage',
} as const;
export function AdjustmentAnalysis({
  data,
  canOpenProducts,
}: { data: OperatingAnalysis; canOpenProducts: boolean }) {
  const kinds = (
    data.hasSales
      ? ['discount', 'free', 'return', ...(data.hasDamage ? ['damage'] : [])]
      : ['damage']
  ) as (keyof typeof adjustmentLabels)[];
  return (
    <AnalysisPanel
      title="Returns, discounts and damage"
      description="Separate views of recorded adjustments in this period. Discounts and returns already affect gross profit; recorded damage is shown separately. These amounts should not be added together as a single loss total."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {kinds.map((kind) => {
          const summary = data.adjustments.summary.find((row) => row.kind === kind);
          const rows = data.adjustments.products.filter((row) => row.kind === kind);
          const financialValue = kind !== 'damage' || data.access.financial;
          const maximum = Math.max(1, ...rows.map((row) => row.amount ?? 0));
          return (
            <details key={kind} className="min-w-0 rounded-lg border p-4" data-adjustment={kind}>
              <summary className="cursor-pointer">
                <span className="text-sm font-medium">{adjustmentLabels[kind]}</span>
                <span className="mt-2 block text-xl font-semibold tabular-nums">
                  {financialValue
                    ? summary?.amount == null && summary?.missingValues
                      ? 'Cost unavailable'
                      : `${summary?.missingValues ? 'Known: ' : ''}${money(summary?.amount ?? 0)}`
                    : `${summary?.records ?? 0} entries`}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {summary?.records ?? 0} {kind === 'damage' ? 'entries' : 'lines'} ·{' '}
                  {kind === 'return'
                    ? 'Returned billed value, including GST'
                    : kind === 'free'
                      ? 'Retail value before GST'
                      : kind === 'discount'
                        ? 'Price reductions excluding free items and GST'
                        : financialValue
                          ? 'Recorded stock cost'
                          : 'Assigned product quantities only'}
                </span>
              </summary>
              {!!summary?.missingValues && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {summary.missingValues} damage entries lack a recorded cost.
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Up to six products, {financialValue ? 'largest recorded values' : 'most entries'}{' '}
                first.
              </p>
              {rows.length ? (
                <ul className="mt-2 divide-y">
                  {rows.map((row, index) => (
                    <li key={`${row.id}:${row.unit}:${index}`} className="py-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0 break-words">
                          {row.id && canOpenProducts ? (
                            <Link
                              href={`/products?q=${encodeURIComponent(row.name)}`}
                              className="font-medium hover:underline"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <p className="font-medium">{row.name}</p>
                          )}
                        </div>
                        {financialValue && (
                          <span className="shrink-0 tabular-nums">
                            {row.amount === null
                              ? 'Unavailable'
                              : `${row.missingValues ? 'Known ' : ''}${money(row.amount)}`}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {number(row.quantity)} {row.unit} · {row.records}{' '}
                        {kind === 'damage' ? 'entries' : 'lines'}
                      </p>
                      {financialValue && row.amount !== null && (
                        <div className="mt-2 h-1 rounded bg-muted" aria-hidden="true">
                          <div
                            className="h-full rounded bg-emerald-700"
                            style={{ width: `${(Math.max(0, row.amount) / maximum) * 100}%` }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No {adjustmentLabels[kind].toLowerCase()} recorded in this scope and period.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </AnalysisPanel>
  );
}
