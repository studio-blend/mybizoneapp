import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands, businesses, categories, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ProductForm } from '../../_components/product-form';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [row] = await tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        description: products.description,
        storeId: products.storeId,
        categoryId: products.categoryId,
        brandId: products.brandId,
        unitType: products.unitType,
        unitSymbol: products.unitSymbol,
        price: products.price,
        costPrice: products.costPrice,
        mrp: products.mrp,
        wholesalePrice: products.wholesalePrice,
        rate1: products.rate1,
        rate2: products.rate2,
        rate3: products.rate3,
        rate4: products.rate4,
        minStock: products.minStock,
        inventory: products.inventory,
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        imageKey: products.imageKey,
        specs: products.specs,
      })
      .from(products)
      .where(and(eq(products.id, params.id), eq(products.businessId, user.businessId)));
    if (!row) return null;

    const [biz] = await tx
      .select({ gstEnabled: businesses.gstEnabled })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    const cats = await tx
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        attributes: categories.attributes,
      })
      .from(categories)
      .orderBy(asc(categories.name));
    const brs = await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .orderBy(asc(brands.name));

    return {
      row,
      gstEnabled: biz?.gstEnabled ?? false,
      stores: sts,
      categories: cats,
      brands: brs,
    };
  });

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <ProductForm
        mode="edit"
        stores={data.stores}
        categories={data.categories}
        brands={data.brands}
        initial={data.row}
        gstEnabled={data.gstEnabled}
      />
    </div>
  );
}
