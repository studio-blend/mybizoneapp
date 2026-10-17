import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { businesses, customers, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { OrderForm } from './order-form';
export const dynamic = 'force-dynamic';
export default async function NewOrderPage() {
  const user = await requireUser();
  await requirePermission(user, 'create_sale');
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [ss, cs, ps, [biz]] = await Promise.all([
      tx
        .select({ id: stores.id, name: stores.name })
        .from(stores)
        .where(eq(stores.businessId, user.businessId))
        .orderBy(asc(stores.name)),
      tx
        .select({ id: customers.id, name: customers.name, address: customers.address })
        .from(customers)
        .where(eq(customers.businessId, user.businessId))
        .orderBy(asc(customers.name)),
      tx
        .select({
          id: products.id,
          name: products.name,
          storeId: products.storeId,
          unitType: products.unitType,
          unitSymbol: products.unitSymbol,
          price: products.price,
          gstRate: products.gstRate,
        })
        .from(products)
        .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
        .orderBy(asc(products.name)),
      tx
        .select({ gstEnabled: businesses.gstEnabled })
        .from(businesses)
        .where(eq(businesses.id, user.businessId)),
    ]);
    return { stores: ss, customers: cs, products: ps, gstEnabled: biz?.gstEnabled ?? false };
  });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/orders" className="text-sm underline">
          Customer orders
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">New customer order</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Agree the items, price and promised handover. Customer advances are recorded separately
          after saving. Add a registered customer first if needed.
        </p>
      </div>
      <OrderForm {...data} />
    </div>
  );
}
