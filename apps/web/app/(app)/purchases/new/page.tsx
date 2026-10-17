import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { activePacks } from '@/lib/wholesale';
import { products, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { PurchaseForm } from '../_components/purchase-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_purchases');
  const data = await withTenant(db, user.businessId, async (tx) => {
    const ps = await tx
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unitSymbol: products.unitSymbol,
        unitType: products.unitType,
        batchTracking: products.batchTracking,
        serialTracking: products.serialTracking,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));

    const ss = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(eq(suppliers.businessId, user.businessId))
      .orderBy(asc(suppliers.name));

    const packs = await activePacks(
      tx,
      user.businessId,
      ps.map((p) => p.id),
    );
    return {
      products: ps,
      suppliers: ss,
      packs: packs.filter((p) =>
        ps.some(
          (product) =>
            product.id === p.productId &&
            product.unitType === p.unitType &&
            product.unitSymbol === p.unitSymbol,
        ),
      ),
    };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PurchaseForm products={data.products} suppliers={data.suppliers} packs={data.packs} />
    </div>
  );
}
