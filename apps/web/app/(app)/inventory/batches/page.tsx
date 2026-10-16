import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { expiryStatus, indiaToday } from '@/lib/stock-batch-policy';
import { products, stockBatchMovements, stockBatches, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import Link from 'next/link';
import { EnableBatchesForm, ReviewBatchForm } from './batch-forms';

export const dynamic = 'force-dynamic';
const statuses = {
  quarantine: 'Quarantined',
  expired: 'Blocked by expiry',
  soon: 'Expires within 30 days',
  available: 'Available',
};
export default async function BatchesPage(props: {
  searchParams: Promise<{ productId?: string; status?: string }>;
}) {
  const user = await requireUser();
  await requirePermission(user, 'manage_inventory');
  const roles = await getUserRoles(user);
  const query = await props.searchParams;
  const productId = /^[a-f0-9-]{36}$/i.test(query.productId ?? '') ? query.productId : undefined;
  const data = await withTenant(db, user.businessId, async (tx) => {
    const catalog = await tx
      .select({
        id: products.id,
        name: products.name,
        inventory: products.inventory,
        unitSymbol: products.unitSymbol,
        batchTracking: products.batchTracking,
        store: stores.name,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));
    const batches = await tx
      .select({
        id: stockBatches.id,
        productId: stockBatches.productId,
        code: stockBatches.code,
        quantity: stockBatches.quantity,
        expiresOn: stockBatches.expiresOn,
        state: stockBatches.state,
        name: products.name,
        unitSymbol: products.unitSymbol,
        active: products.active,
        store: stores.name,
      })
      .from(stockBatches)
      .innerJoin(products, eq(products.id, stockBatches.productId))
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(
        and(
          eq(stockBatches.businessId, user.businessId),
          gt(stockBatches.quantity, '0'),
          productId ? eq(stockBatches.productId, productId) : undefined,
        ),
      )
      .orderBy(asc(stockBatches.expiresOn), asc(stockBatches.createdAt), asc(stockBatches.id));
    const movements = productId
      ? await tx
          .select({
            id: stockBatchMovements.id,
            code: stockBatches.code,
            kind: stockBatchMovements.kind,
            quantity: stockBatchMovements.quantity,
            at: stockBatchMovements.createdAt,
          })
          .from(stockBatchMovements)
          .innerJoin(stockBatches, eq(stockBatches.id, stockBatchMovements.batchId))
          .where(
            and(
              eq(stockBatchMovements.businessId, user.businessId),
              eq(stockBatches.productId, productId),
            ),
          )
          .orderBy(desc(stockBatchMovements.createdAt), desc(stockBatchMovements.id))
          .limit(100)
      : [];
    return { catalog, batches, movements };
  });
  const today = indiaToday();
  const counts = Object.fromEntries(
    Object.keys(statuses).map((status) => [
      status,
      data.batches.filter((batch) => expiryStatus(batch.state, batch.expiresOn, today) === status)
        .length,
    ]),
  );
  const visible = data.batches.filter(
    (batch) =>
      !query.status ||
      !(query.status in statuses) ||
      expiryStatus(batch.state, batch.expiresOn, today) === query.status,
  );
  const selected = data.catalog.find((product) => product.id === productId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Batches & expiry</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review stock that needs attention, inspect returns and trace lot movements. Checkout picks
          the earliest expiry first. Stock is blocked from its printed expiry date, using India
          time.
        </p>
      </div>
      <form method="get" className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="min-w-0 text-sm font-medium sm:flex-1">
          Product
          <select
            name="productId"
            defaultValue={productId ?? ''}
            className="mt-1 block w-full rounded-md border bg-background p-2"
          >
            <option value="">All products</option>
            {data.catalog
              .filter((p) => p.batchTracking)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.store}
                </option>
              ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium sm:min-w-48">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ''}
            className="mt-1 block w-full rounded-md border bg-background p-2"
          >
            <option value="">All statuses</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Apply filters
        </button>
        <Link className="py-2 text-sm underline" href="/inventory/batches">
          Clear
        </Link>
      </form>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Object.entries(statuses).map(([status, label]) => (
          <a
            key={status}
            href={`/inventory/batches?status=${status}${productId ? `&productId=${productId}` : ''}`}
            className="rounded-xl border p-4 hover:bg-muted/50"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {counts[status]} <span className="text-sm font-normal">lots</span>
            </p>
          </a>
        ))}
      </div>
      <section aria-label="Stock lots" className="space-y-3">
        <h2 className="text-lg font-semibold">
          {selected
            ? `${selected.name} · ${selected.inventory} ${selected.unitSymbol} total stock`
            : 'Stock lots'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Expiry and quarantine affect sellable stock. Physical stock stays recorded until sold,
          returned to the supplier or written off in Damage Logs.
        </p>
        {!visible.length && (
          <p className="rounded-lg border p-6 text-sm text-muted-foreground">
            No stocked lots match these filters. Enable tracking below for products that need expiry
            control.
          </p>
        )}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {visible.map((batch) => {
            const status = expiryStatus(batch.state, batch.expiresOn, today);
            return (
              <article key={batch.id} className="min-w-0 rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={`/inventory/batches?productId=${batch.productId}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {batch.name}
                  </a>
                  <span
                    className={`text-xs font-medium ${status === 'expired' ? 'text-destructive' : status === 'available' ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {statuses[status]}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm">
                  {batch.code} · {batch.store}
                  {!batch.active && ' · Inactive product'}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Physical stock</dt>
                    <dd className="font-medium tabular-nums">
                      {batch.quantity} {batch.unitSymbol}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expiry</dt>
                    <dd>{batch.expiresOn ?? 'Unverified'}</dd>
                  </div>
                </dl>
                {batch.active && <ReviewBatchForm batch={batch} />}
              </article>
            );
          })}
        </div>
      </section>
      {productId && (
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Latest lot movements</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Up to 100 movements. Positive quantities received; negative quantities removed. Reviews
            preserve physical stock.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Date (India)</th>
                  <th className="p-2">Lot</th>
                  <th className="p-2">Activity</th>
                  <th className="p-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((movement) => (
                  <tr key={movement.id} className="border-t">
                    <td className="whitespace-nowrap p-2">
                      {movement.at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </td>
                    <td className="p-2">{movement.code}</td>
                    <td className="p-2">{movement.kind.replaceAll('_', ' ')}</td>
                    <td className="p-2 text-right tabular-nums">{movement.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">
          Enable batch tracking for a product
        </summary>
        <div className="mt-4 max-w-3xl">
          <EnableBatchesForm products={data.catalog.filter((p) => !p.batchTracking)} />
        </div>
      </details>
      <div className="flex flex-wrap gap-4 text-sm">
        {hasPermission(roles, 'manage_purchases') && (
          <Link className="underline" href="/purchases/new">
            Receive purchases
          </Link>
        )}
        <Link className="underline" href="/damage-logs/new">
          Write off damaged or expired stock
        </Link>
        {hasPermission(roles, 'manage_purchases') && (
          <Link className="underline" href="/purchase-returns/new">
            Return stock to supplier
          </Link>
        )}
      </div>
    </div>
  );
}
