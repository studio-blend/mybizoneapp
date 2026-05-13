import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { DamageLogForm } from '../_components/damage-log-form';

export const dynamic = 'force-dynamic';

export default async function NewDamageLogPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: products.id,
        name: products.name,
        unitSymbol: products.unitSymbol,
        inventory: products.inventory,
        costPrice: products.costPrice,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name)),
  );

  return (
    <div className="mx-auto max-w-lg">
      <DamageLogForm products={rows} />
    </div>
  );
}
