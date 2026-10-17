import { type CashbookMethod, cashbookMethods, cashbookRange, loadCashbook } from '@/lib/cashbook';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
export const dynamic = 'force-dynamic';
const money = (n: number | string) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function CashbookPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string; method?: string; page?: string }> }) {
  const user = await requireUser();
  await requirePermission(user, 'manage_expenses');
  const params = await searchParams;
  let range: ReturnType<typeof cashbookRange>;
  let error = '';
  try {
    range = cashbookRange(params.from, params.to);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Invalid date range';
    range = cashbookRange();
  }
  const method: CashbookMethod = cashbookMethods.includes(params.method as CashbookMethod)
    ? (params.method as CashbookMethod)
    : 'all';
  const page = /^[1-9]\d{0,4}$/.test(params.page ?? '') ? Number(params.page) : 1;
  const data = await withTenant(db, user.businessId, (tx) =>
    loadCashbook(tx, user.businessId, range.from, range.to, method, page),
  );
  const max = Math.max(1, ...data.days.flatMap((d) => [Number(d.incoming), Number(d.outgoing)]));
  const href = (p: number) =>
    `/cashbook?${new URLSearchParams({ ...range, method, page: String(p) })}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cashbook</h1>
        <p className="text-sm text-muted-foreground">
          Recorded receipts and payments across the business, using India dates.{' '}
          <a href="/settlements" className="underline">
            Manage bill allocations
          </a>
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
        <div className="min-w-0 basis-full space-y-2 sm:basis-auto">
          <Label htmlFor="from">From</Label>
          <Input type="date" id="from" name="from" defaultValue={range.from} required />
        </div>
        <div className="min-w-0 basis-full space-y-2 sm:basis-auto">
          <Label htmlFor="to">To</Label>
          <Input type="date" id="to" name="to" defaultValue={range.to} required />
        </div>
        <div className="min-w-0 basis-full space-y-2 sm:basis-auto">
          <Label htmlFor="method">Payment method</Label>
          <Select id="method" name="method" defaultValue={method}>
            {cashbookMethods.map((m) => (
              <option key={m} value={m}>
                {m === 'all'
                  ? 'All methods'
                  : m === 'upi'
                    ? 'UPI'
                    : m === 'unknown'
                      ? 'Unknown method'
                      : m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Apply filters</Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}. Showing this month.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Money in', money(data.totals.incoming)],
          ['Money out', money(data.totals.outgoing)],
          [
            'Net recorded movement',
            money(Number(data.totals.incoming) - Number(data.totals.outgoing)),
          ],
        ].map(([label, value]) => (
          <div className="rounded-lg border p-4" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="break-words text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
        Net movement is not cash available or a cleared bank balance. Opening cash, transfers, bank
        clearing are not recorded here. Advances, explicit return refunds and linked money
        corrections appear once. Applying an advance or assigning a bill never adds money again. EMI
        down payments have an unknown method; instalments include interest. This register follows
        the current source documents, including editable expense entries.
      </p>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Daily money movement</h2>
        <p className="text-xs text-muted-foreground">
          Green: money in · Grey: money out. Full filtered period; bars use a shared scale.
        </p>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {data.days.map((d) => (
            <div
              key={d.day}
              aria-label={`${d.day}: in ${money(d.incoming)}, out ${money(d.outgoing)}`}
            >
              <div className="flex flex-wrap justify-between gap-1 text-xs">
                <span>{d.day}</span>
                <span className="tabular-nums">
                  {money(d.incoming)} in · {money(d.outgoing)} out
                </span>
              </div>
              <div className="mt-1 h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-emerald-600"
                  style={{ width: `${(Number(d.incoming) / max) * 100}%` }}
                />
              </div>
              <div className="mt-1 h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-slate-500"
                  style={{ width: `${(Number(d.outgoing) / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {!data.days.length && (
            <p className="text-sm text-muted-foreground">
              No recorded money movements in this period.
            </p>
          )}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payment methods</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.methods.map((m) => (
            <div className="rounded-lg border p-4 text-sm" key={m.method}>
              <p className="font-medium capitalize">{m.method === 'upi' ? 'UPI' : m.method}</p>
              <p className="tabular-nums">
                {money(m.incoming)} in · {money(m.outgoing)} out
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Money movements</h2>
        <p className="text-sm text-muted-foreground">
          {data.totals.count} entries · page {page} · 100 per page. Summary includes all matching
          entries.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                {['Date', 'Source / reference', 'Method', 'Money in', 'Money out'].map((t) => (
                  <th className="whitespace-nowrap p-3" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr className="border-b" key={`${r.kind}-${r.id}`}>
                  <td className="whitespace-nowrap p-3">{r.day}</td>
                  <td className="p-3">
                    <a className="underline" href={r.href}>
                      {r.kind}
                    </a>
                    <p className="min-w-36 max-w-72 break-words text-muted-foreground">{r.label}</p>
                  </td>
                  <td className="p-3">{r.method}</td>
                  <td className="whitespace-nowrap p-3 tabular-nums">{money(r.incoming)}</td>
                  <td className="whitespace-nowrap p-3 tabular-nums">{money(r.outgoing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="flex gap-4">
          {page > 1 && (
            <a href={href(page - 1)} className="underline">
              Previous page
            </a>
          )}
          {page * 100 < Number(data.totals.count) && (
            <a href={href(page + 1)} className="underline">
              Next page
            </a>
          )}
        </nav>
      </section>
    </div>
  );
}
