import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { PurchaseForm } from '../_components/purchase-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const ps = await tx
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unitSymbol: products.unitSymbol,
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

    return { products: ps, suppliers: ss };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PurchaseForm products={data.products} suppliers={data.suppliers} />
    </div>
  );
}
