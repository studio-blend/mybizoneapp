import { recipeQuantity } from '@/lib/kitchen-policy';
import { loadKitchenData } from '@/lib/kitchen-queries';
import Link from 'next/link';
import { TicketForm } from './forms';
export const dynamic = 'force-dynamic';
export default async function KitchenPage(props: {
  searchParams: Promise<{ store?: string; view?: string }>;
}) {
  const params = await props.searchParams;
  const data = await loadKitchenData(params.store, params.view);
  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kitchen preparation</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Plan recipe batches, follow preparation and record actual finished stock. Cashiers sell
            the prepared stock through the normal POS.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm underline">
          {data.canConfigure && <Link href="/kitchen/recipes">Recipe versions</Link>}
          <Link href="/kitchen/waste">Kitchen waste</Link>
        </div>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-4 rounded-xl border p-4">
        <label className="w-full min-w-0 space-y-2 text-sm sm:flex-1">
          <span className="block">Store</span>
          <select
            name="store"
            defaultValue={params.store ?? ''}
            className="h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">All permitted stores</option>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full min-w-0 space-y-2 text-sm sm:flex-1">
          <span className="block">Ticket status</span>
          <select
            name="view"
            defaultValue={params.view ?? ''}
            className="h-10 w-full rounded-md border bg-background px-3"
          >
            <option value="">All statuses</option>
            {['queued', 'preparing', 'completed', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 w-full rounded-md border px-4 text-sm sm:w-auto">
          Apply filters
        </button>
      </form>
      <dl className="grid grid-cols-2 gap-5 border-y py-5 lg:grid-cols-4">
        {[
          ['Awaiting prep', data.totals.queued],
          ['In kitchen', data.totals.preparing],
          ['Completed today', data.totals.today],
          ['Waste value · last 30 days', `₹${Number(data.wasteTotal.value).toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {data.wasteTotal.unknown > 0 && (
        <p className="text-sm text-muted-foreground">
          Waste value excludes {data.wasteTotal.unknown} records with unknown ingredient cost.
        </p>
      )}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,390px)]">
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Prep tickets</h2>
            <p className="text-xs text-muted-foreground">
              Latest 100 matching tickets. Summary counts cover the selected stores across all
              statuses. Today uses India time.
            </p>
          </div>
          {!data.tickets.length && (
            <div className="space-y-2 rounded-xl border p-6">
              <p>No kitchen tickets match these filters.</p>
              <p className="text-sm text-muted-foreground">
                Add a real recipe version, then create a prep ticket. Planning leaves stock
                unchanged.
              </p>
            </div>
          )}
          <div className="divide-y">
            {data.tickets.map((t) => {
              const r = data.recipes.find((r) => r.id === t.recipeId);
              if (!r) return null;
              return (
                <article key={t.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/kitchen/${t.id}`}
                        className="break-words font-semibold underline"
                      >
                        {t.reference}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.name} · {data.stores.find((s) => s.id === t.storeId)?.name}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs ${t.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ''}`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="text-sm">
                    {t.runs} recipe batches · Target{' '}
                    {recipeQuantity(r.yieldQty, t.runs, r.unitType)} {r.unitSymbol}
                    {t.actualOutput !== null ? ` · Actual ${t.actualOutput} ${r.unitSymbol}` : ''}
                  </p>
                  {t.note && <p className="break-words text-sm text-muted-foreground">{t.note}</p>}
                </article>
              );
            })}
          </div>
        </section>
        <section className="min-w-0 rounded-xl border p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Plan preparation</h2>
          {data.recipes.some((r) => r.active) ? (
            <TicketForm data={data} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No active recipes in these stores. A stock manager can define the ingredients and
              expected yield in Recipe versions.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
