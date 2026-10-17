import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { batchChoices } from '@/lib/stock-batches';
import { products, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { PurchaseReturnForm } from '../_components/return-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchaseReturnPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_purchases');

  const [prods, supps] = await withTenant(db, user.businessId, async (tx) => {
    const productRows = await tx
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unitSymbol: products.unitSymbol,
        batchTracking: products.batchTracking,
        serialTracking: products.serialTracking,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));

    const supplierRows = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(eq(suppliers.businessId, user.businessId))
      .orderBy(asc(suppliers.name));

    return [productRows, supplierRows] as const;
  });
  const batches = await withTenant(db, user.businessId, (tx) => batchChoices(tx, user.businessId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Purchase Return</h1>
        <p className="text-sm text-muted-foreground">
          Record goods returned to a supplier and decrement inventory. Enter base stock units: for a
          12-piece carton, return 12 pc. Original receipt quantities and prices apply.
        </p>
      </div>

      <PurchaseReturnForm products={prods} suppliers={supps} batches={batches} />
    </div>
  );
}
