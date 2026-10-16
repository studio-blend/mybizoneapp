import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { products, stockSerialEvents, stockSerials, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { z } from 'zod/v3';
import { EnableSerialsForm, ReviewSerialForm, WarrantySettingsForm } from './serial-forms';

export const dynamic = 'force-dynamic';
const states = {
  available: 'Available',
  quarantine: 'Quarantined',
  sold: 'Sold',
  damaged: 'Written off',
  supplier_return: 'Returned to supplier',
};
export default async function SerialsPage(props: {
  searchParams: Promise<{ productId?: string; code?: string; state?: string; page?: string }>;
}) {
  const user = await requireUser();
  await requirePermission(user, 'manage_inventory');
  const roles = await getUserRoles(user);
  const query = await props.searchParams;
  const productId = z.string().uuid().safeParse(query.productId).success
    ? query.productId
    : undefined;
  const search = query.code?.trim().toUpperCase().slice(0, 80);
  const state = Object.hasOwn(states, query.state ?? '') ? query.state : undefined;
  const page = /^[1-9]\d{0,4}$/.test(query.page ?? '') ? Number(query.page) : 1;
  const data = await withTenant(db, user.businessId, async (tx) => {
    const catalog = await tx
      .select({
        id: products.id,
        name: products.name,
        store: stores.name,
        inventory: products.inventory,
        batchTracking: products.batchTracking,
        serialTracking: products.serialTracking,
        unitType: products.unitType,
        unitSymbol: products.unitSymbol,
        warrantyMonths: products.warrantyMonths,
        warrantyIssuer: products.warrantyIssuer,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));
    const filter = and(
      eq(stockSerials.businessId, user.businessId),
      productId ? eq(stockSerials.productId, productId) : undefined,
      search ? eq(stockSerials.code, search) : undefined,
      state ? eq(stockSerials.state, state) : undefined,
    );
    const units = await tx
      .select({
        id: stockSerials.id,
        code: stockSerials.code,
        state: stockSerials.state,
        productId: stockSerials.productId,
        name: products.name,
        store: stores.name,
      })
      .from(stockSerials)
      .innerJoin(products, eq(products.id, stockSerials.productId))
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(filter)
      .orderBy(asc(stockSerials.code))
      .limit(50)
      .offset((page - 1) * 50);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(stockSerials)
      .where(filter);
    const counts = await tx
      .select({ state: stockSerials.state, total: sql<number>`count(*)::int` })
      .from(stockSerials)
      .where(
        and(
          eq(stockSerials.businessId, user.businessId),
          productId ? eq(stockSerials.productId, productId) : undefined,
        ),
      )
      .groupBy(stockSerials.state);
    const events = productId
      ? await tx
          .select({
            id: stockSerialEvents.id,
            code: stockSerials.code,
            kind: stockSerialEvents.kind,
            at: stockSerialEvents.createdAt,
          })
          .from(stockSerialEvents)
          .innerJoin(stockSerials, eq(stockSerials.id, stockSerialEvents.serialId))
          .where(
            and(
              eq(stockSerialEvents.businessId, user.businessId),
              eq(stockSerials.productId, productId),
            ),
          )
          .orderBy(desc(stockSerialEvents.createdAt), desc(stockSerialEvents.id))
          .limit(50)
      : [];
    return { catalog, units, total: count?.total ?? 0, counts, events };
  });
  const selected = data.catalog.find((item) => item.id === productId);
  const pageUrl = (number: number) => {
    const params = new URLSearchParams();
    if (productId) params.set('productId', productId);
    if (search) params.set('code', search);
    if (state) params.set('state', state);
    params.set('page', String(number));
    return `/inventory/serials?${params}`;
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Serial inventory</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Track each physical unit from receipt to sale, return and inspection. Returned units stay
          quarantined until reviewed. Warranty terms are recorded on each sale.
        </p>
      </div>
      <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="min-w-0 text-sm font-medium">
          Product
          <select
            name="productId"
            defaultValue={productId ?? ''}
            className="mt-1 w-full rounded-md border bg-background p-2"
          >
            <option value="">All products</option>
            {data.catalog
              .filter((item) => item.serialTracking)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.store}
                </option>
              ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          Exact serial
          <input
            name="code"
            defaultValue={search}
            maxLength={80}
            className="mt-1 w-full rounded-md border bg-background p-2"
          />
        </label>
        <label className="min-w-0 text-sm font-medium">
          State
          <select
            name="state"
            defaultValue={state ?? ''}
            className="mt-1 w-full rounded-md border bg-background p-2"
          >
            <option value="">All states</option>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-4">
          <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
            Apply filters
          </button>
          <Link className="py-2 text-sm underline" href="/inventory/serials">
            Clear
          </Link>
        </div>
      </form>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Object.entries(states).map(([value, label]) => (
          <div key={value} className="rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums">
              {data.counts.find((item) => item.state === value)?.total ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-label="Serial units" className="space-y-3">
        <h2 className="text-lg font-semibold">
          {selected
            ? `${selected.name} · ${selected.inventory} pc physical stock`
            : 'Registered units'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Available and quarantined units make up physical stock. Sold, written-off and
          supplier-returned units remain in the history. Showing up to 50 of {data.total} matching
          units.
        </p>
        {!data.units.length && (
          <p className="rounded-lg border p-5 text-sm text-muted-foreground">
            No serials match these filters. Reconcile a product below to enable serial tracking.
          </p>
        )}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {data.units.map((unit) => (
            <article key={unit.id} className="min-w-0 rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="break-all font-mono text-sm font-semibold">{unit.code}</p>
                <span className="text-xs font-medium">
                  {states[unit.state as keyof typeof states]}
                </span>
              </div>
              <a
                href={`/inventory/serials?productId=${unit.productId}`}
                className="mt-2 inline-block text-sm underline"
              >
                {unit.name}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">{unit.store}</p>
              {['available', 'quarantine'].includes(unit.state) && <ReviewSerialForm unit={unit} />}
            </article>
          ))}
        </div>
        <nav aria-label="Serial pagination" className="flex gap-4 text-sm">
          {page > 1 && (
            <a href={pageUrl(page - 1)} className="underline">
              Previous page
            </a>
          )}
          {page * 50 < data.total && (
            <a href={pageUrl(page + 1)} className="underline">
              Next page
            </a>
          )}
        </nav>
      </section>
      {selected?.serialTracking && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold">
            Warranty terms for future sales
          </summary>
          <div className="mt-4 max-w-3xl">
            <WarrantySettingsForm product={selected} />
          </div>
        </details>
      )}
      {productId && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-semibold">Latest serial movements</summary>
          <ul className="mt-3 divide-y text-sm">
            {data.events.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="break-all">
                  {event.code} · {event.kind.replaceAll('_', ' ')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">
          Enable serial tracking for a product
        </summary>
        <div className="mt-4 max-w-3xl">
          <EnableSerialsForm
            products={data.catalog.filter(
              (item) =>
                !item.serialTracking &&
                !item.batchTracking &&
                item.unitType === 'piece' &&
                item.unitSymbol === 'pc',
            )}
          />
        </div>
      </details>
      {hasPermission(roles, 'view_sales') && (
        <Link href="/warranties" className="inline-block text-sm underline">
          Look up sale warranties
        </Link>
      )}
    </div>
  );
}
