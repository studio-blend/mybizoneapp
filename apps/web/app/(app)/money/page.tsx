import { db } from '@/lib/db';
import { moneyRegister } from '@/lib/money-queries';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { indiaToday } from '@/lib/stock-batch-policy';
import { withTenant } from '@mybizone/db/tenant';
import { MoneyForm } from './_components/money-form';
export const dynamic = 'force-dynamic';
const money = (n: string | number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function MoneyPage({
  searchParams,
}: { searchParams: Promise<{ saved?: string; page?: string }> }) {
  const user = await requireUser();
  await requirePermission(user, 'manage_expenses');
  const params = await searchParams;
  const data = await withTenant(db, user.businessId, (tx) => moneyRegister(tx, user.businessId));
  const saved = [
    ...data.accounts,
    ...data.postings,
    ...data.offsets,
    ...data.history,
    ...data.openings,
  ].some((r) => r.id === params.saved);
  const accountName = (id: string | null) => data.accounts.find((a) => a.id === id)?.name ?? '—';
  const page = Math.max(
    1,
    Math.min(
      Math.max(1, Math.ceil(data.postings.length / 50)),
      Number.parseInt(params.page ?? '1', 10) || 1,
    ),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cash &amp; bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verified openings, account assignments and payment clearing across your business.
        </p>
      </div>
      <nav className="flex flex-wrap gap-4 text-sm">
        <a className="underline" href="/cashbook">
          Cashbook
        </a>
        <a className="underline" href="/settlements/funds">
          Advances &amp; refunds
        </a>
        <a className="underline" href="/reports/credit-ageing">
          Credit bill reconciliation
        </a>
      </nav>
      {saved && (
        <output className="block rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
          Saved account evidence. Balances and clearing states refreshed.
        </output>
      )}
      <div
        className={`rounded-lg border p-4 ${data.ready ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
      >
        <strong>
          {!data.accounts.length
            ? 'Set up verified openings'
            : data.ready
              ? 'Recorded money reconciled'
              : 'Needs reconciliation'}
        </strong>
        <p className="mt-1 text-sm">
          {!data.accounts.length
            ? 'Add each cash or bank account with a counted or statement-backed start-of-day balance.'
            : `${data.unassigned.length} sources have unassigned money · ${data.stale.length} captured sources changed or disappeared.`}{' '}
          Available amounts below use cleared entries less reserved outgoing money. Check them
          against physical cash and bank statements; this is not a live bank feed.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.accounts.map((a) => (
          <section key={a.id} className="rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{a.name}</h2>
              <span className="text-xs uppercase text-muted-foreground">{a.kind}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Opening {a.opening_on}: {money(a.opening_balance)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Recorded cleared balance</dt>
                <dd className="text-xl font-semibold tabular-nums">{money(a.cleared)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {data.ready
                    ? 'Available from recorded entries'
                    : 'Provisional after reservations'}
                </dt>
                <dd
                  className={`text-xl font-semibold tabular-nums ${Number(a.available) < 0 ? 'text-red-700' : ''}`}
                >
                  {money(a.available)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pending incoming</dt>
                <dd>{money(a.pending_in)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reserved outgoing</dt>
                <dd>{money(a.pending_out)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <MoneyForm data={data} today={indiaToday()} />
      {!!data.stale.length && (
        <section className="rounded-lg border border-red-300 p-4">
          <h2 className="font-semibold">Changed source evidence</h2>
          <p className="text-sm">
            Cancel pending or reverse cleared assignments, check the source and assign the corrected
            amount. Existing offsets need external reconciliation if their source was later edited.
          </p>
          <ul className="mt-2 text-sm">
            {data.stale.map((s) => (
              <li key={s.id}>
                <a className="underline" href={s.href}>
                  {s.label}
                </a>{' '}
                · captured {s.source_day} · {money(s.amount)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Account entries</h2>
        <p className="text-sm text-muted-foreground">
          Bouncing changes account evidence only. Correct linked bill allocations and settlements in
          Advances &amp; refunds, then reconcile the bounced correction here.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Date / reference', 'Source', 'From → to', 'Amount', 'State'].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.postings.slice((page - 1) * 50, page * 50).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    {p.booked_on}
                    <div className="font-medium">{p.reference}</div>
                    <div className="max-w-xs text-xs text-muted-foreground">{p.note}</div>
                  </td>
                  <td className="p-3">
                    {p.href ? (
                      <a className="underline" href={p.href}>
                        {p.label}
                      </a>
                    ) : (
                      'Internal transfer'
                    )}
                  </td>
                  <td className="p-3">
                    {accountName(p.from_account_id)} → {accountName(p.to_account_id)}
                  </td>
                  <td className="p-3 tabular-nums">{money(p.amount)}</td>
                  <td className="p-3 font-medium">
                    {p.state}
                    {p.cleared_on && (
                      <div className="text-xs font-normal">Cleared {p.cleared_on}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.postings.length && (
          <p className="text-sm text-muted-foreground">
            No account entries yet. Recorded receipts and payments remain in the cashbook until
            assigned.
          </p>
        )}
        <nav className="flex gap-4 text-sm">
          {page > 1 && (
            <a className="underline" href={`/money?page=${page - 1}`}>
              Previous
            </a>
          )}
          <span>Page {page}</span>
          {page * 50 < data.postings.length && (
            <a className="underline" href={`/money?page=${page + 1}`}>
              Next
            </a>
          )}
        </nav>
      </section>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Clearing, opening corrections and noncash reconciliation history
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          {data.accounts.map((a) => (
            <p key={a.id}>
              Original opening · {a.name} · {a.opening_on} · {money(a.original_opening_balance)} ·{' '}
              {a.reference} · {a.note}
            </p>
          ))}
          {data.history.map((e) => (
            <p key={e.id}>
              {e.event_on} · {e.kind} · {e.reference} · {e.note}
            </p>
          ))}
          {data.openings.map((e) => (
            <p key={e.id}>
              Opening correction · {accountName(e.account_id)} · {money(e.opening_balance)} ·{' '}
              {e.reference} · {e.note}
            </p>
          ))}
          {data.offsets.map((e) => (
            <p key={e.id}>
              {e.booked_on} · Noncash bounced correction · {money(e.amount)} · {e.reference} ·{' '}
              {e.note}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}
