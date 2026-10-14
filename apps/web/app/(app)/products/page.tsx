import { ListPagination } from '@/components/list-pagination';
import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { PAGE_SIZE, parsePage } from '@/lib/pagination';
import { requireUser } from '@/lib/session';
import { brands, categories, products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, desc, eq, ilike, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { Suspense } from 'react';
import { DeleteProductButton } from './_components/delete-button';
import { ProductFilters } from './_components/product-filters';

export const dynamic = 'force-dynamic';

/** Recursively collect a category id and all its descendant ids. */
function collectDescendants(
  allCats: { id: string; parentId: string | null }[],
  rootId: string,
): string[] {
  const children = new Map<string, string[]>();
  for (const category of allCats) {
    if (!category.parentId) continue;
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category.id);
    children.set(category.parentId, siblings);
  }
  const seen = new Set<string>();
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (!current) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(children.get(current) ?? []));
  }
  return [...seen];
}

interface Props {
  searchParams: Promise<{
    q?: string;
    categoryId?: string;
    storeId?: string;
    brandId?: string;
    page?: string;
  }>;
}

export default async function ProductsPage(props: Props) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const { q, categoryId, storeId, brandId } = searchParams;
  const page = parsePage(searchParams.page);

  const data = await withTenant(db, user.businessId, async (tx) => {
    // Load filter options in parallel — rows query depends on allCats so runs after
    const [categoryRows, storeRows, allBrands] = await Promise.all([
      tx
        .select({
          id: categories.id,
          name: categories.name,
          parentId: categories.parentId,
          storeId: categories.storeId,
        })
        .from(categories)
        .orderBy(asc(categories.name)),
      tx.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
      tx.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    ]);
    const allStores = storeRows.filter((store) =>
      hasPermission(roles, 'manage_products', { storeId: store.id }),
    );
    if (!allStores.length && !hasPermission(roles, 'manage_products'))
      throw new Error('Permission denied');
    if (storeId && !hasPermission(roles, 'manage_products', { storeId }))
      throw new Error('Permission denied');
    const allowedIds = allStores.map((store) => store.id);
    const allCats = categoryRows.filter(
      (category) => !category.storeId || allowedIds.includes(category.storeId),
    );

    // Build WHERE conditions
    const conditions = [
      eq(products.businessId, user.businessId),
      inArray(products.storeId, allowedIds),
    ];

    if (q?.trim()) {
      conditions.push(ilike(products.name, `%${q.trim()}%`));
    }

    if (categoryId) {
      const descendantIds = collectDescendants(allCats, categoryId);
      conditions.push(inArray(products.categoryId, descendantIds));
    }

    if (storeId) {
      conditions.push(eq(products.storeId, storeId));
    }

    if (brandId) {
      conditions.push(eq(products.brandId, brandId));
    }

    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        inventory: products.inventory,
        unitSymbol: products.unitSymbol,
        active: products.active,
        imageKey: products.imageKey,
        storeName: stores.name,
        categoryName: categories.name,
        brandName: brands.name,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(...conditions))
      .orderBy(desc(products.active), desc(products.updatedAt), desc(products.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);

    return {
      rows: rows.slice(0, PAGE_SIZE),
      hasNext: rows.length > PAGE_SIZE,
      allCats,
      allStores,
      allBrands,
    };
  });

  const isFiltered = !!(q || categoryId || storeId || brandId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild>
          <Link href="/products/new">New product</Link>
        </Button>
      </div>

      {/* Filter bar */}
      <Suspense>
        <ProductFilters categories={data.allCats} stores={data.allStores} brands={data.allBrands} />
      </Suspense>

      {data.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {page > 1 ? 'No more products' : isFiltered ? 'No products match' : 'No products yet'}
            </CardTitle>
            <CardDescription>
              {page > 1
                ? 'Use Previous to return to your products.'
                : isFiltered
                  ? 'Try adjusting the search or filters.'
                  : 'Add your first product. Inventory is tracked per store, so make sure a store exists first.'}
            </CardDescription>
          </CardHeader>
          {!isFiltered && page === 1 && (
            <CardContent>
              <Button asChild>
                <Link href="/products/new">Create product</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2 border-b text-xs text-muted-foreground">
              {data.rows.length} product{data.rows.length !== 1 ? 's' : ''} on this page
              {isFiltered ? ' (filtered)' : ''}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price (₹)</TableHead>
                  <TableHead className="text-right">Inventory</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((p) => (
                  <TableRow key={p.id} className={p.active ? '' : 'opacity-50'}>
                    <TableCell>
                      {p.imageKey ? (
                        <img
                          src={`/api/files/${p.imageKey}`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {!p.active && <span className="ml-2 text-xs">(deleted)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.storeName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.categoryName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.brandName ?? '—'}</TableCell>
                    <TableCell className="text-right">{p.price}</TableCell>
                    <TableCell className="text-right">
                      {p.inventory} {p.unitSymbol}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/products/${p.id}/edit`} prefetch={false}>
                            Edit
                          </Link>
                        </Button>
                        {p.active && <DeleteProductButton id={p.id} name={p.name} />}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <ListPagination path="/products" filters={searchParams} page={page} hasNext={data.hasNext} />
    </div>
  );
}
