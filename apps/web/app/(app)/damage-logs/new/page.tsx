import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { batchChoices } from '@/lib/stock-batches';
import { products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { DamageLogForm } from '../_components/damage-log-form';

export const dynamic = 'force-dynamic';

export default async function NewDamageLogPage() {
  const user = await requireUser();
  await requirePermission(user, 'manage_inventory');
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: products.id,
        name: products.name,
        unitSymbol: products.unitSymbol,
        inventory: products.inventory,
        costPrice: products.costPrice,
        batchTracking: products.batchTracking,
      })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
      .orderBy(asc(products.name)),
  );
  const batches = await withTenant(db, user.businessId, (tx) => batchChoices(tx, user.businessId));

  return (
    <div className="mx-auto max-w-lg">
      <DamageLogForm products={rows} batches={batches} />
    </div>
  );
}
