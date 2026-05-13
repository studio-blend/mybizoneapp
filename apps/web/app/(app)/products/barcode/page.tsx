import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import { Button } from '@mybizone/ui/button';
import Link from 'next/link';
import { BarcodeSheet } from './_components/barcode-sheet';

export const dynamic = 'force-dynamic';

export default async function BarcodePage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, async (tx) =>
    tx.select({
      id: products.id,
      name: products.name,
      barcode: products.barcode,
      sku: products.sku,
      mrp: products.mrp,
      price: products.price,
    })
    .from(products)
    .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
    .orderBy(products.name)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Barcode Labels</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/products">← Products</Link>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Select products and print labels. Each label shows barcode + name + price.
      </p>
      <BarcodeSheet products={rows} />
    </div>
  );
}
