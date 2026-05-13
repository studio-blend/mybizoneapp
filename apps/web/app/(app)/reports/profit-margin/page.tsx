import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands, categories, products, saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProfitMarginPage() {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const { byBrand, byItem } = await withTenant(db, user.businessId, async (tx) => {
    const byBrand = await tx
      .select({
        brandName: brands.name,
        revenue: sum(saleItems.lineTotal).as('revenue'),
        cost: sql<string>`sum(${saleItems.costPriceAtSale} * ${saleItems.qty})`.as('cost'),
        profit: sql<string>`sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty})`.as('profit'),
        margin: sql<string>`ROUND(100.0 * sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty}) / NULLIF(sum(${saleItems.lineTotal}), 0), 1)`.as('margin'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .leftJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
          sql`${saleItems.costPriceAtSale} IS NOT NULL`,
        ),
      )
      .groupBy(brands.name)
      .orderBy(
        desc(
          sql`sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty})`,
        ),
      )
      .limit(20);

    const byItem = await tx
      .select({
        name: saleItems.productName,
        qtySold: sum(saleItems.qty).as('qty_sold'),
        revenue: sum(saleItems.lineTotal).as('revenue'),
        profit: sql<string>`sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty})`.as('profit'),
        margin: sql<string>`ROUND(100.0 * sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty}) / NULLIF(sum(${saleItems.lineTotal}), 0), 1)`.as('margin'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          gte(sales.createdAt, since),
          eq(sales.status, 'completed'),
          sql`${saleItems.costPriceAtSale} IS NOT NULL`,
        ),
      )
      .groupBy(saleItems.productName)
      .orderBy(
        desc(
          sql`sum(${saleItems.lineTotal} - ${saleItems.costPriceAtSale} * ${saleItems.qty})`,
        ),
      )
      .limit(20);

    return { byBrand, byItem };
  });

  const hasData = byBrand.length > 0 || byItem.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Profit Margin</h1>
          <p className="text-sm text-muted-foreground">Last 30 days — items with cost price set.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Set cost price on products to see profit reports.
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Profit by brand</CardTitle>
              <CardDescription>Grouped by product brand, last 30 days.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Revenue ₹</TableHead>
                    <TableHead className="text-right">Cost ₹</TableHead>
                    <TableHead className="text-right">Profit ₹</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byBrand.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    byBrand.map((row, i) => (
                      <TableRow key={row.brandName ?? i}>
                        <TableCell>{row.brandName ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {Number(row.revenue ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.cost ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.profit ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{row.margin ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top 20 items by profit</CardTitle>
              <CardDescription>Last 30 days — items with cost price set.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Revenue ₹</TableHead>
                    <TableHead className="text-right">Profit ₹</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byItem.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    byItem.map((row, i) => (
                      <TableRow key={row.name ?? i}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{row.qtySold}</TableCell>
                        <TableCell className="text-right">
                          {Number(row.revenue ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.profit ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{row.margin ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
