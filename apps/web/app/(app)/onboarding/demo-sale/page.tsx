import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { OnboardingProgress } from '../_components/progress';
import { DemoSaleForm } from './_components/demo-sale-form';

export const dynamic = 'force-dynamic';

const DEMO_PRODUCT_NAME = 'Demo product';
const DEMO_PRODUCT_PRICE = '100.00';

export default async function OnboardingDemoSalePage() {
  const user = await requireUser();

  const data = await withTenant(db, user.businessId, async (tx) => {
    const [store] = await tx
      .select({ id: stores.id })
      .from(stores)
      .limit(1);
    if (!store) return null;

    let [product] = await tx
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .limit(1);

    if (!product) {
      const [created] = await tx
        .insert(products)
        .values({
          businessId: user.businessId,
          storeId: store.id,
          name: DEMO_PRODUCT_NAME,
          unitType: 'piece',
          unitSymbol: 'pc',
          price: DEMO_PRODUCT_PRICE,
          inventory: '100',
        })
        .returning({ id: products.id, name: products.name });
      product = created;
    }

    return product ? { storeId: store.id, productId: product.id, productName: product.name } : null;
  });

  if (!data) redirect('/onboarding/store');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Try a demo sale</h1>
        <p className="text-sm text-muted-foreground">
          See how recording a sale works in under 10 seconds.
        </p>
      </div>
      <OnboardingProgress current={3} />
      <DemoSaleForm
        storeId={data.storeId}
        productId={data.productId}
        productName={data.productName}
      />
    </div>
  );
}
