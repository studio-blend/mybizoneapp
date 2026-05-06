import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { asc } from 'drizzle-orm';
import { CatalogueUploadForm } from '../_components/upload-form';

export const dynamic = 'force-dynamic';

export default async function NewCataloguePage() {
  const user = await requireUser();
  const { brandList, storeList } = await withTenant(db, user.businessId, async (tx) => {
    const brandList = await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .orderBy(asc(brands.name));
    const storeList = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    return { brandList, storeList };
  });

  return (
    <div className="mx-auto max-w-md">
      <CatalogueUploadForm brands={brandList} stores={storeList} />
    </div>
  );
}
