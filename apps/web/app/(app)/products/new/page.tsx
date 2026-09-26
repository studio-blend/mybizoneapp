import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { brands, businesses, categories, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { ProductForm } from '../_components/product-form';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [biz] = await tx
      .select({ gstEnabled: businesses.gstEnabled })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    const allowedStores = sts.filter((store) =>
      hasPermission(roles, 'manage_products', { storeId: store.id }),
    );
    if (!allowedStores.length && !hasPermission(roles, 'manage_products'))
      throw new Error('Permission denied');
    const cats = await tx
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        attributes: categories.attributes,
        storeId: categories.storeId,
      })
      .from(categories)
      .orderBy(asc(categories.name));
    const brs = await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .orderBy(asc(brands.name));
    return {
      gstEnabled: biz?.gstEnabled ?? false,
      stores: allowedStores,
      categories: cats.filter(
        (category) =>
          !category.storeId || allowedStores.some((store) => store.id === category.storeId),
      ),
      brands: brs,
    };
  });

  if (data.stores.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Create a store first</CardTitle>
            <CardDescription>
              Products belong to a store. Set one up before adding products.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/stores/new" className="text-sm underline">
              Create store
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ProductForm
        mode="create"
        stores={data.stores}
        categories={data.categories}
        brands={data.brands}
        gstEnabled={data.gstEnabled}
      />
    </div>
  );
}
