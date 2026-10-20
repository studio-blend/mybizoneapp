import { creditAgeing } from '@/lib/credit-ageing';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
export const dynamic = 'force-dynamic';
const money = (n: string | number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function CreditAgeingPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  await requirePermission(user, 'manage_expenses');
  const params = await searchParams;
  const side = params.tab === 'purchases' ? 'purchases' : 'sales';
  const rows = await withTenant(db, user.businessId, (tx) =>
    creditAgeing(tx, user.businessId, side),
  );
  const buckets = ['0–30', '31–60', '61–90', '91+'].map((label) => ({
    label,
    value: rows
      .filter((r) => r.consistent && r.bucket === label)
      .reduce((n, r) => n + Number(r.remaining), 0),
  }));
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Credit bill reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordinary credit bills, allocation evidence and payment clearing. Order and EMI balances
          stay in their own ledgers.
        </p>
      </div>
      <nav className="flex flex-wrap gap-4 text-sm">
        <a href="/reports/credit-ageing" className="underline">
          Customer bills
        </a>
        <a href="/reports/credit-ageing?tab=purchases" className="underline">
          Supplier bills
        </a>
        <a href="/money" className="underline">
          Cash &amp; bank
        </a>
        <a href={`/settlements?tab=${side}`} className="underline">
          Bill allocations
        </a>
      </nav>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        {rows.filter((r) => !r.consistent).length} bills need reconciliation. Invoice age is
        measured from the bill date; overdue days appear only when an explicit due date exists.
        Consistent evidence is limited to recorded ordinary credit bills and fully cleared allocated
        payments; it is not an audited statement of debt.
      </p>
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Remaining value by invoice age</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Only bills with consistent evidence contribute to these bars.
        </p>
        <div className="space-y-3">
          {buckets.map((b) => (
            <div key={b.label} className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
              <span>{b.label} days</span>
              <div>
                <span className="tabular-nums">{money(b.value)}</span>
                <div className="mt-1 h-2 rounded bg-muted">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${(Math.max(0, b.value) / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                'Bill / party',
                'Invoice age',
                'Due date',
                'Remaining recorded value',
                'Evidence',
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <a className="underline" href={`/${side}/${r.id}`}>
                    {r.billNo}
                  </a>
                  <div>{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.day}</div>
                </td>
                <td className="p-3">{r.age} days</td>
                <td className="p-3">
                  {r.due ?? 'Not recorded'}
                  {r.overdue > 0 && <div>{r.overdue} days overdue</div>}
                </td>
                <td className="p-3 tabular-nums">{money(r.remaining)}</td>
                <td className="p-3">
                  {r.consistent ? 'Bill evidence consistent' : r.reasons.join('; ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No ordinary credit bills to reconcile.</p>
      )}
    </div>
  );
}
