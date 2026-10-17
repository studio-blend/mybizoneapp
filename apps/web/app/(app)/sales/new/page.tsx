import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { sellableStockSql } from '@/lib/stock-batches';
import { activePacks } from '@/lib/wholesale';
import { businesses, customers, products, saleItems, sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';
import { PosCart } from './cart';

export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const allowedStores = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(eq(stores.businessId, user.businessId))
      .orderBy(asc(stores.name)),
  );
  const authorizedStores = allowedStores.filter((store) =>
    hasPermission(roles, 'create_sale', { storeId: store.id }),
  );
  if (authorizedStores.length === 0 && !hasPermission(roles, 'create_sale'))
    throw new Error('Permission denied');
  const storeIds = authorizedStores.map((store) => store.id);
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [sts, ps, [biz], recentRaw, cs] = await Promise.all([
      Promise.resolve(authorizedStores),
      tx
        .select({
          id: products.id,
          storeId: products.storeId,
          name: products.name,
          sku: products.sku,
          barcode: products.barcode,
          unitType: products.unitType,
          unitSymbol: products.unitSymbol,
          price: products.price,
          wholesalePrice: products.wholesalePrice,
          mrp: products.mrp,
          rate1: products.rate1,
          rate2: products.rate2,
          rate3: products.rate3,
          rate4: products.rate4,
          gstRate: products.gstRate,
          inventory: sellableStockSql,
          serialTracking: products.serialTracking,
          availableSerials: sql<
            string[]
          >`ARRAY(SELECT u.code FROM stock_serials u WHERE u.product_id="products".id AND u.business_id="products".business_id AND u.state='available' ORDER BY u.code LIMIT 20)`,
        })
        .from(products)
        .where(
          and(
            eq(products.businessId, user.businessId),
            eq(products.active, true),
            inArray(products.storeId, storeIds),
          ),
        )
        .orderBy(asc(products.name)),
      tx
        .select({ gstEnabled: businesses.gstEnabled })
        .from(businesses)
        .where(eq(businesses.id, user.businessId)),
      // Recent products: last 50 sale_items by this user, deduplicated to 5 distinct product_ids
      tx
        .select({ productId: saleItems.productId })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(
          and(
            eq(saleItems.businessId, user.businessId),
            eq(sales.employeeId, user.id),
            inArray(sales.storeId, storeIds),
          ),
        )
        .orderBy(desc(sales.createdAt))
        .limit(50),
      tx
        .select({
          id: customers.id,
          name: customers.name,
          outstandingBalance: customers.outstandingBalance,
          rateCategory: customers.rateCategory,
          creditLimit: customers.creditLimit,
          creditDays: customers.creditDays,
        })
        .from(customers)
        .where(
          and(
            eq(customers.businessId, user.businessId),
            hasPermission(roles, 'manage_customers') ? undefined : sql`false`,
          ),
        )
        .orderBy(asc(customers.name)),
    ]);

    const seen = new Set<string>();
    const recentProductIds: string[] = [];
    for (const { productId } of recentRaw) {
      if (productId && !seen.has(productId) && recentProductIds.length < 5) {
        seen.add(productId);
        recentProductIds.push(productId);
      }
    }

    const packs = await activePacks(
      tx,
      user.businessId,
      ps.map((p) => p.id),
    );
    return {
      packs: packs.filter((p) =>
        ps.some(
          (product) =>
            product.id === p.productId &&
            product.unitType === p.unitType &&
            product.unitSymbol === p.unitSymbol,
        ),
      ),
      stores: sts,
      products: ps,
      gstEnabled: biz?.gstEnabled ?? false,
      recentProductIds,
      customers: cs,
    };
  });

  if (data.stores.length === 0 || data.products.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Set up first</CardTitle>
          <CardDescription>
            You need at least one store and one product before recording a sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link href="/stores/new" className="block underline">
            Create store
          </Link>
          <Link href="/products/new" className="block underline">
            Create product
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <PosCart
      stores={data.stores}
      products={data.products}
      gstEnabled={data.gstEnabled}
      recentProductIds={data.recentProductIds}
      customers={data.customers}
      packs={data.packs}
    />
  );
}
