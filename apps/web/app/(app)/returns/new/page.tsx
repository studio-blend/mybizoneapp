import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { ReturnForm } from '../_components/return-form';

export const dynamic = 'force-dynamic';

export default async function NewReturnPage() {
  const user = await requireUser();

  const [prods, custs] = await withTenant(db, user.businessId, async (tx) => {
    const productRows = await tx
      .select({
        id: products.id,
        name: products.name,
        unitSymbol: products.unitSymbol,
        inventory: products.inventory,
        price: products.price,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));

    const customerRows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(eq(customers.businessId, user.businessId))
      .orderBy(asc(customers.name));

    return [productRows, customerRows] as const;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Return</h1>
        <p className="text-sm text-muted-foreground">
          Record a sales return and restock inventory.
        </p>
      </div>

      <ReturnForm products={prods} customers={custs} />
    </div>
  );
}
