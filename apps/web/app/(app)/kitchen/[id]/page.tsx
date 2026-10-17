import { recipeQuantity } from '@/lib/kitchen-policy';
import { loadKitchenTicket } from '@/lib/kitchen-queries';
import { stockUnits } from '@/lib/stock-batch-policy';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompleteTicketForm, PrintTicket, TicketStatus } from '../forms';
export const dynamic = 'force-dynamic';
export default async function TicketPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await loadKitchenTicket(id);
  if (!data) notFound();
  const { ticket: t, recipe: r } = data;
  const target = recipeQuantity(r.yieldQty, t.runs, r.unitType);
  const output = data.products.find((p) => p.id === r.outputProductId);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/kitchen" className="text-sm underline">
          Kitchen preparation
        </Link>
        <PrintTicket />
      </div>
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="break-words text-2xl font-semibold">{t.reference}</h1>
          <span className="rounded-full border px-3 py-1 text-sm">{t.status}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.stores.find((s) => s.id === t.storeId)?.name} · {r.name} ·{' '}
          {t.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">Ticket {t.id}</p>
        {t.note && <p className="mt-3 break-words text-sm">{t.note}</p>}
      </header>
      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Prepared output</h2>
        <p className="mt-2">
          {r.outputName} · {t.runs} recipe batches
        </p>
        <p className="mt-1 text-sm">
          Target: {target} {r.unitSymbol}
          {t.actualOutput !== null ? ` · Actual: ${t.actualOutput} ${r.unitSymbol}` : ''}
        </p>
        {t.status === 'completed' && (
          <>
            <p className="mt-3 text-sm">
              Ingredient cost estimate:{' '}
              {t.ingredientCost === null
                ? 'Unknown — one or more ingredient costs are missing'
                : `₹${t.ingredientCost}`}{' '}
              {t.unitCost !== null && `· ₹${t.unitCost} per ${r.unitSymbol}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Current ingredient costs, excluding labour and overheads. Prepared stock uses a
              blended unit cost when prior stock also has known cost.
            </p>
            {t.batchCode && (
              <p className="mt-2 text-sm">
                Batch {t.batchCode} · expiry {t.expiresOn}
              </p>
            )}
            {t.completionNote && <p className="mt-2 break-words text-sm">{t.completionNote}</p>}
          </>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {t.status === 'completed' ? 'Recorded ingredient consumption' : 'Ingredients required'}
        </h2>
        {data.ingredients.map((i) => {
          const needed = recipeQuantity(i.qty, t.runs, i.unitType);
          const p = data.products.find((p) => p.id === i.productId);
          const available = p?.sellable ?? '0';
          const consumed = data.consumed.find((c) => c.productId === i.productId);
          const coverage = Math.min(
            100,
            Math.max(0, (stockUnits(available) / stockUnits(needed)) * 100),
          );
          return (
            <article key={i.id} className="space-y-3 border-b pb-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <h3 className="font-semibold">{i.productName}</h3>
                <p>
                  {consumed?.qty ?? needed} {i.unitSymbol} {consumed ? 'consumed' : 'needed'}
                </p>
              </div>
              {t.status !== 'completed' && t.status !== 'cancelled' && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {available} {i.unitSymbol} currently sellable · checked again when recording
                    preparation
                  </p>
                  <div
                    role="meter"
                    aria-label={`${i.productName} ingredient coverage`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(coverage)}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full ${coverage === 100 ? 'bg-emerald-600' : 'bg-amber-600'}`}
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                </>
              )}
              {consumed && (
                <p className="text-xs text-muted-foreground">
                  Recorded value:{' '}
                  {consumed.totalValue === null ? 'Unknown' : `₹${consumed.totalValue}`}
                </p>
              )}
            </article>
          );
        })}
      </section>
      <div className="print:hidden">
        <TicketStatus id={t.id} status={t.status} />
      </div>
      {t.status === 'preparing' && (
        <section className="space-y-4 rounded-xl border p-5 print:hidden">
          <h2 className="text-lg font-semibold">Record completed preparation</h2>
          <CompleteTicketForm
            id={t.id}
            target={target}
            unit={r.unitSymbol}
            unitType={r.unitType}
            batchTracking={output?.batchTracking ?? false}
          />
        </section>
      )}
      {t.status === 'completed' && (
        <p className="text-sm text-muted-foreground">
          Finished stock is ready for normal checkout. Record unsold or spoiled finished goods in
          Kitchen waste; consumption cannot be undone.
        </p>
      )}
    </div>
  );
}
