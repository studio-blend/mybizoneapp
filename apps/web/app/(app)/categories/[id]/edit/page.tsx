import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { categories, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { CategoryForm } from '../../_components/category-form';

export const dynamic = 'force-dynamic';

export default async function EditCategoryPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [row] = await tx
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        storeId: categories.storeId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(and(eq(categories.id, params.id), eq(categories.businessId, user.businessId)));
    if (!row) return null;
    const cats = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name));
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    return { row, parentOptions: cats, storeOptions: sts };
  });

  if (!data) notFound();
  return (
    <div className="mx-auto max-w-md">
      <CategoryForm
        mode="edit"
        parentOptions={data.parentOptions}
        storeOptions={data.storeOptions}
        initial={data.row}
      />
    </div>
  );
}
