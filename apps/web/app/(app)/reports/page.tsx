import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products, saleItems, sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const data = await withTenant(db, user.businessId, async (tx) => {
    // Sales aggregated by day for the 30-day window. date_trunc keeps Postgres doing
    // the bucketing instead of pulling raw rows back to Node.
    const byDay = await tx
      .select({
        day: sql<string>`date_trunc('day', ${sales.createdAt})::date`.as('day'),
        revenue: sum(sales.total).as('revenue'),
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
        ),
      )
      .groupBy(sql`date_trunc('day', ${sales.createdAt})`)
      .orderBy(sql`date_trunc('day', ${sales.createdAt})`);

    // Top products by gross line revenue in the same window. Joins through sales for the
    // date filter; group by product id + name (snapshot is fine since name is denormalised).
    const topProducts = await tx
      .select({
        productId: saleItems.productId,
        name: saleItems.productName,
        qty: sum(saleItems.qty).as('qty'),
        revenue: sum(saleItems.lineTotal).as('revenue'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
        ),
      )
      .groupBy(saleItems.productId, saleItems.productName)
      .orderBy(desc(sum(saleItems.lineTotal)))
      .limit(10);

    const byPayment = await tx
      .select({
        paymentMethod: sales.paymentMethod,
        revenue: sum(sales.total).as('revenue'),
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
        ),
      )
      .groupBy(sales.paymentMethod);

    const lowStock = await tx
      .select({
        id: products.id,
        name: products.name,
        inventory: products.inventory,
        unitSymbol: products.unitSymbol,
        storeName: stores.name,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .where(
        and(
          eq(products.businessId, user.businessId),
          eq(products.active, true),
          sql`${products.inventory} <= 5`,
        ),
      )
      .orderBy(products.inventory)
      .limit(50);

    // Profit estimation: only items with cost_price_at_sale contribute.
    // Returns null profit when no items have cost data.
    const [profitRow] = await tx
      .select({
        estimatedProfit: sql<string>`sum(CASE WHEN ${saleItems.costPriceAtSale} IS NOT NULL THEN ${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty} ELSE 0 END)`.as(
          'estimated_profit',
        ),
        coveredItems: sql<number>`count(CASE WHEN ${saleItems.costPriceAtSale} IS NOT NULL THEN 1 END)::int`.as(
          'covered_items',
        ),
        totalItems: sql<number>`count(*)::int`.as('total_items'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
        ),
      );

    return { byDay, topProducts, byPayment, lowStock, profitRow };
  });

  const maxRevenue = data.byDay.reduce((m, r) => Math.max(m, Number(r.revenue ?? 0)), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Last 30 days.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/api/reports/inventory/export">Inventory CSV</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/api/sales/export">Sales CSV</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by day</CardTitle>
          <CardDescription>
            {data.byDay.length === 0
              ? 'No completed sales in the window.'
              : `${data.byDay.length} days with activity.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.byDay.length === 0 ? null : (
            <ul className="space-y-1">
              {data.byDay.map((d) => {
                const rev = Number(d.revenue ?? 0);
                const widthPct = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0;
                return (
                  <li
                    key={d.day}
                    className="grid grid-cols-[6rem_1fr_5rem] items-center gap-2 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(d.day).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <div className="h-3 w-full rounded bg-muted">
                      <div className="h-3 rounded bg-primary" style={{ width: `${widthPct}%` }} />
                    </div>
                    <span className="text-right font-medium">₹ {rev.toFixed(2)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.profitRow && data.profitRow.totalItems > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Profit (estimated)</CardTitle>
            <CardDescription>
              Based on {data.profitRow.coveredItems} of {data.profitRow.totalItems} line items with
              cost price set.{' '}
              {data.profitRow.coveredItems < data.profitRow.totalItems && (
                <Link href="/products" className="underline">
                  Set cost prices on products
                </Link>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              ₹ {Number(data.profitRow.estimatedProfit ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By revenue in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No sales in window.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topProducts.map((p) => (
                    <TableRow key={p.productId ?? p.name}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-right">{p.qty}</TableCell>
                      <TableCell className="text-right">{p.revenue}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byPayment.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No data.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.byPayment.map((p) => (
                    <TableRow key={p.paymentMethod}>
                      <TableCell>{p.paymentMethod}</TableCell>
                      <TableCell className="text-right">{p.count}</TableCell>
                      <TableCell className="text-right">{p.revenue}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Low stock</CardTitle>
          <CardDescription>Inventory at or below 5 units.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Store</TableHead>
                <TableHead className="text-right">Inventory</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lowStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No low-stock items.
                  </TableCell>
                </TableRow>
              ) : (
                data.lowStock.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/products/${p.id}/edit`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.storeName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {p.inventory} {p.unitSymbol}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
