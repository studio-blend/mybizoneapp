import { loadKitchenData } from '@/lib/kitchen-queries';
import Link from 'next/link';
import { WasteForm } from '../forms';
export const dynamic = 'force-dynamic';
export default async function WastePage() {
  const data = await loadKitchenData();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/kitchen" className="text-sm underline">
        Kitchen preparation
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Kitchen waste</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Record physical ingredients or prepared food discarded from stock. Keep the reason and
          kitchen reference so recurring preparation losses and unsold food can be reviewed.
        </p>
      </header>
      <div className="grid items-start gap-7 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Record stock discarded</h2>
          <WasteForm data={data} />
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-lg font-semibold">Recent waste records</h2>
          <p className="text-sm text-muted-foreground">
            Last 30 days: ₹{Number(data.wasteTotal.value).toFixed(2)} recorded value across{' '}
            {data.wasteTotal.count} records.
            {data.wasteTotal.unknown > 0
              ? ` ${data.wasteTotal.unknown} records have unknown cost and are excluded from that value.`
              : ''}{' '}
            Latest 100 records below.
          </p>
          {!data.waste.length && (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">
              No kitchen waste recorded yet.
            </p>
          )}
          {data.waste.map((w) => (
            <article key={w.id} className="space-y-2 border-t py-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">{w.productName}</h3>
                <p className="text-sm">
                  {w.qty} {w.unitSymbol}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {w.reason} · {data.stores.find((s) => s.id === w.storeId)?.name} ·{' '}
                {w.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
              <p className="break-words text-sm">{w.notes}</p>
              <p className="text-sm">
                Value: {w.totalValue === null ? 'Unknown' : `₹${w.totalValue}`}
              </p>
            </article>
          ))}
          <Link href="/damage-logs" className="inline-block text-sm underline">
            All stock write-offs
          </Link>
        </section>
      </div>
    </div>
  );
}
