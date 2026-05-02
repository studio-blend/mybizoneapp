import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { categories, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { asc } from 'drizzle-orm';
import { CategoryForm } from '../_components/category-form';

export const dynamic = 'force-dynamic';

export default async function NewCategoryPage() {
  const user = await requireUser();
  const { parentOptions, storeOptions } = await withTenant(db, user.businessId, async (tx) => {
    const cats = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name));
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    return { parentOptions: cats, storeOptions: sts };
  });

  return (
    <div className="mx-auto max-w-md">
      <CategoryForm mode="create" parentOptions={parentOptions} storeOptions={storeOptions} />
    </div>
  );
}
