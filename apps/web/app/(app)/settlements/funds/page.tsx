import { db } from '@/lib/db';
import { fundsLabels } from '@/lib/funds-policy';
import { fundsRegister } from '@/lib/funds-queries';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
import { FundsForm } from './_components/funds-form';
export const dynamic = 'force-dynamic';
const money = (v: string | number) =>
  `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function FundsPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string; saved?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  await requirePermission(user, 'manage_expenses');
  const side = params.tab === 'purchases' ? 'purchases' : 'sales';
  const data = await withTenant(db, user.businessId, (tx) =>
    fundsRegister(tx, user.businessId, side),
  );
  const saved = data.events.find((e) => e.id === params.saved);
  const advances = data.events.filter((e) => e.kind === 'advance' && Number(e.available) > 0);
  const refunds = data.refunds.filter((r) => Number(r.remaining) > 0);
  const page = Math.max(
    1,
    Math.min(
      Math.max(1, Math.ceil(data.events.length / 100)),
      Number.parseInt(params.page ?? '1', 10) || 1,
    ),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Advances &amp; refunds</h1>
        <p className="text-sm text-muted-foreground">
          Keep prepaid money separate from unpaid bills. Record refunds when money actually changes
          hands.
        </p>
      </div>
      <nav className="flex flex-wrap gap-4 text-sm">
        <a
          className="underline"
          aria-current={side === 'sales' ? 'page' : undefined}
          href="/settlements/funds"
        >
          Customer funds
        </a>
        <a
          className="underline"
          aria-current={side === 'purchases' ? 'page' : undefined}
          href="/settlements/funds?tab=purchases"
        >
          Supplier funds
        </a>
        <a className="underline" href={`/settlements?tab=${side}`}>
          Bill settlements
        </a>
        <a className="underline" href="/cashbook">
          Cashbook
        </a>
      </nav>
      {saved && (
        <output className="block rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          Saved: {fundsLabels[saved.kind]} · {money(saved.amount)} · {saved.name}
        </output>
      )}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">
            {side === 'sales' ? 'Unused customer advances' : 'Unused supplier advances'}
          </dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {money(advances.reduce((n, a) => n + Number(a.available), 0))}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            {side === 'sales' ? 'Money held for customers' : 'Money prepaid to suppliers'}; shown
            separately from debt.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Return refunds still due</dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {money(refunds.reduce((n, r) => n + Number(r.remaining), 0))}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">
            {side === 'sales' ? 'Refunds owed to customers' : 'Refunds to collect from suppliers'}{' '}
            from reconciled return records.
          </p>
        </div>
      </dl>
      <FundsForm key={side} side={side} data={data} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Unused advances</h2>
        {advances.length ? (
          <div className="divide-y rounded-lg border">
            {advances.map((a) => (
              <article key={a.id} className="flex flex-wrap justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-muted-foreground">{a.reference || a.note}</p>
                </div>
                <p className="font-semibold tabular-nums">{money(a.available)} available</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No unused advances. Record an advance when a customer prepays or you prepay a supplier.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Return refunds to resolve</h2>
        {refunds.length ? (
          <div className="divide-y rounded-lg border">
            {refunds.map((r) => (
              <article key={r.id} className="flex flex-wrap justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">
                    {r.returnNo} · {r.name}
                  </p>
                  <p className="text-muted-foreground">Original bill {r.billNo}</p>
                </div>
                <p className="font-semibold tabular-nums">{money(r.remaining)} due</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded return refunds are due.</p>
        )}
        {data.legacyReturns > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.legacyReturns} return records have no verified refund entitlement snapshot.
            Reconcile their payment evidence separately; no refund amount has been guessed.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Funds and correction history</h2>
        <p className="text-xs text-muted-foreground">
          Original records and linked corrections remain visible. Page {page}; 100 records per page.
        </p>
        <div className="divide-y rounded-lg border">
          {data.events.slice((page - 1) * 100, page * 100).map((e) => (
            <article key={e.id} id={`event-${e.id}`} className="space-y-1 p-4 text-sm">
              <p className="font-medium">
                {fundsLabels[e.kind]} · {e.name} · {money(e.amount)}
                {e.reversed ? ' · Reversed' : ''}
              </p>
              <p className="break-words text-muted-foreground">
                {e.reference && `${e.reference} · `}
                {e.note}
              </p>
              {e.documentId && (
                <a
                  className="mr-4 text-xs underline"
                  href={
                    e.documentKind === 'return'
                      ? `/${side === 'sales' ? 'returns' : 'purchase-returns'}#return-${e.documentId}`
                      : `/settlements?tab=${side}#${e.documentKind}-${e.documentId}`
                  }
                >
                  View source {e.documentKind}
                </a>
              )}
              {e.sourceId && (
                <a
                  className="text-xs underline"
                  href={`/settlements/funds?tab=${side}&saved=${e.sourceId}#event-${e.sourceId}`}
                >
                  View original funds record
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                {e.method && ` · ${e.method}`}
              </p>
            </article>
          ))}
          {!data.events.length && (
            <p className="p-4 text-sm text-muted-foreground">
              No advances, refunds or corrections recorded.
            </p>
          )}
        </div>
        <nav className="flex gap-4 text-sm">
          {page > 1 && (
            <a className="underline" href={`/settlements/funds?tab=${side}&page=${page - 1}`}>
              Previous page
            </a>
          )}
          {page * 100 < data.events.length && (
            <a className="underline" href={`/settlements/funds?tab=${side}&page=${page + 1}`}>
              Next page
            </a>
          )}
        </nav>
      </section>
    </div>
  );
}
