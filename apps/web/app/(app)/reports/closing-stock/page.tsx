import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products, saleItems, sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, eq, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ClosingStockPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const user = await requireUser();

  const asOfDate = searchParams.date ? new Date(searchParams.date) : new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const isToday =
    !searchParams.date ||
    searchParams.date === new Date().toISOString().slice(0, 10);

  const displayDate = asOfDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: products.id,
        name: products.name,
        currentInventory: products.inventory,
        unitSymbol: products.unitSymbol,
        soldAfter: sql<string>`COALESCE(sum(CASE WHEN ${sales.createdAt} > ${asOfDate.toISOString()} AND ${sales.status} = 'completed' THEN ${saleItems.qty}::numeric ELSE 0 END), 0)`.as(
          'sold_after',
        ),
        storeName: stores.name,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .leftJoin(saleItems, eq(saleItems.productId, products.id))
      .leftJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(products.businessId, user.businessId),
          eq(products.active, true),
        ),
      )
      .groupBy(
        products.id,
        products.name,
        products.inventory,
        products.unitSymbol,
        stores.name,
      )
      .orderBy(products.name);
  });

  const withAsOf = rows.map((r) => ({
    ...r,
    asOfInventory: (Number(r.currentInventory) + Number(r.soldAfter)).toFixed(3),
  }));

  // Default value for the date input (today in YYYY-MM-DD)
  const todayIso = new Date().toISOString().slice(0, 10);
  const inputValue = searchParams.date ?? todayIso;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Closing Stock</h1>
          <p className="text-sm text-muted-foreground">
            Approximate inventory as of a selected date.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date picker form */}
      <Card>
        <CardHeader>
          <CardTitle>Select date</CardTitle>
          <CardDescription>
            Closing stock is approximated by adding back sales that occurred after the selected date.
            Purchases/receipts are not accounted for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex items-center gap-3">
            <input
              type="date"
              name="date"
              defaultValue={inputValue}
              max={todayIso}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" variant="default">
              View
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Stock as of {displayDate}
            {isToday && ' (current)'}
          </CardTitle>
          <CardDescription>
            {withAsOf.length === 0
              ? 'No active products found.'
              : `${withAsOf.length} product${withAsOf.length === 1 ? '' : 's'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Store</TableHead>
                <TableHead className="text-right">Stock as of {displayDate}</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead>Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withAsOf.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                withAsOf.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/products/${p.id}/edit`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.storeName ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{p.asOfInventory}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Number(p.currentInventory).toFixed(3)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.unitSymbol ?? '—'}</TableCell>
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
