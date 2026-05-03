import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { PosCart } from './cart';

export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    const ps = await tx
      .select({
        id: products.id,
        storeId: products.storeId,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        unitType: products.unitType,
        unitSymbol: products.unitSymbol,
        price: products.price,
        gstRate: products.gstRate,
        inventory: products.inventory,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name));
    const [biz] = await tx
      .select({ gstEnabled: businesses.gstEnabled })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    return { stores: sts, products: ps, gstEnabled: biz?.gstEnabled ?? false };
  });

  if (data.stores.length === 0 || data.products.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Set up first</CardTitle>
          <CardDescription>
            You need at least one store and one product before recording a sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link href="/stores/new" className="block underline">
            Create store
          </Link>
          <Link href="/products/new" className="block underline">
            Create product
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <PosCart stores={data.stores} products={data.products} gstEnabled={data.gstEnabled} />;
}
