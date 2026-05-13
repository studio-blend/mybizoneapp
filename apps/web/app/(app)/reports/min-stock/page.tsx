import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { products, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, eq, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MinStockPage() {
  const user = await requireUser();

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: products.id,
        name: products.name,
        inventory: products.inventory,
        minStock: products.minStock,
        unitSymbol: products.unitSymbol,
        storeName: stores.name,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .where(
        and(
          eq(products.businessId, user.businessId),
          eq(products.active, true),
          sql`${products.inventory} <= COALESCE(${products.minStock}, 5)`,
        ),
      )
      .orderBy(products.inventory);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Low Stock Report</h1>
          <p className="text-sm text-muted-foreground">
            Products at or below their reorder level.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Low stock items</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? 'All products are adequately stocked.'
              : `${rows.length} product${rows.length === 1 ? '' : 's'} need restocking.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Store</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Reorder Level</TableHead>
                <TableHead className="text-right">Shortage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No low-stock items.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const reorderLevel = Number(p.minStock ?? 5);
                  const current = Number(p.inventory);
                  const shortage = reorderLevel - current;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/products/${p.id}/edit`} className="hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.storeName ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {current} {p.unitSymbol}
                      </TableCell>
                      <TableCell className="text-right">
                        {reorderLevel} {p.unitSymbol}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${shortage > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {shortage > 0 ? `${shortage.toFixed(3)} ${p.unitSymbol}` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
