import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { productPacks, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ArchivePackButton, CreatePackForm } from './pack-forms';
export const dynamic = 'force-dynamic';
export default async function PacksPage() {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const data = await withTenant(db, user.businessId, async (tx) => {
    const all = await tx
      .select({
        id: products.id,
        name: products.name,
        unitType: products.unitType,
        unitSymbol: products.unitSymbol,
        active: products.active,
        storeId: products.storeId,
        store: stores.name,
      })
      .from(products)
      .innerJoin(
        stores,
        and(eq(stores.id, products.storeId), eq(stores.businessId, products.businessId)),
      )
      .where(eq(products.businessId, user.businessId))
      .orderBy(asc(products.name));
    const allowed = all.filter((p) =>
      hasPermission(roles, 'manage_products', { storeId: p.storeId }),
    );
    if (!allowed.length && !hasPermission(roles, 'manage_products'))
      throw new Error('Permission denied');
    const packs = allowed.length
      ? await tx
          .select()
          .from(productPacks)
          .where(
            and(
              eq(productPacks.businessId, user.businessId),
              inArray(
                productPacks.productId,
                allowed.map((p) => p.id),
              ),
            ),
          )
          .orderBy(desc(productPacks.active), asc(productPacks.name))
      : [];
    return { products: allowed, packs };
  });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pack definitions</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Receive or sell cartons, cases and loose units while keeping one stock quantity per
          product. Definitions do not adjust physical stock.
        </p>
      </div>
      <section className="rounded-xl border p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a pack conversion</h2>
        <CreatePackForm products={data.products.filter((p) => p.active)} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saved conversions</h2>
        {!data.packs.length && (
          <p className="rounded-xl border p-5 text-sm text-muted-foreground">
            No pack definitions yet. Add the real conversion printed on the product's packaging.
          </p>
        )}
        <div className="grid items-start gap-4 md:grid-cols-2">
          {data.packs.map((pack) => {
            const product = data.products.find((p) => p.id === pack.productId);
            const changed =
              product?.unitType !== pack.unitType || product.unitSymbol !== pack.unitSymbol;
            return (
              <article key={pack.id} className="min-w-0 space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">{pack.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {pack.active ? 'Active' : 'Archived'}
                  </span>
                </div>
                <p className="text-sm">
                  {product?.name} · {product?.store}
                </p>
                <p className="text-sm font-medium">
                  1 {pack.name} = {pack.qtyPerPack} {pack.unitSymbol}
                </p>
                {changed && (
                  <p className="text-sm text-destructive">
                    Product units changed. Archive this definition and add a matching conversion.
                  </p>
                )}
                {pack.active && <ArchivePackButton id={pack.id} />}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
