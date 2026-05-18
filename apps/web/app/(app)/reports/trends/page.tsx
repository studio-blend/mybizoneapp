import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function formatMonth(raw: string | Date): string {
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default async function TrendsPage() {
  const user = await requireUser();

  const { monthly, topProducts } = await withTenant(db, user.businessId, async (tx) => {
    const [monthly, topProducts] = await Promise.all([
      // Monthly sales for last 12 months
      tx.select({
        month: sql<string>`DATE_TRUNC('month', ${sales.createdAt})`.as('month'),
        billCount: sql<number>`COUNT(*)::int`.as('bill_count'),
        revenue: sum(sales.total).as('revenue'),
      }).from(sales).where(
        and(eq(sales.businessId, user.businessId), eq(sales.status, 'completed'), sql`${sales.createdAt} >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'`),
      ).groupBy(sql`DATE_TRUNC('month', ${sales.createdAt})`).orderBy(sql`DATE_TRUNC('month', ${sales.createdAt})`),
      // Top 10 products this calendar month
      tx.select({
        productId: saleItems.productId,
        productName: saleItems.productName,
        totalQty: sum(saleItems.qty).as('total_qty'),
        totalRevenue: sum(saleItems.lineTotal).as('total_revenue'),
      }).from(saleItems).innerJoin(sales, eq(sales.id, saleItems.saleId)).where(
        and(eq(saleItems.businessId, user.businessId), eq(sales.status, 'completed'), sql`${sales.createdAt} >= DATE_TRUNC('month', NOW())`),
      ).groupBy(saleItems.productId, saleItems.productName).orderBy(desc(sum(saleItems.lineTotal))).limit(10),
    ]);
    return { monthly, topProducts };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Monthly Sales Trends</h1>
          <p className="text-sm text-muted-foreground">Last 12 months — current month top products.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly revenue</CardTitle>
          <CardDescription>
            {monthly.length === 0
              ? 'No completed sales in the last 12 months.'
              : `${monthly.length} month${monthly.length === 1 ? '' : 's'} with activity.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Revenue ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No data.
                  </TableCell>
                </TableRow>
              ) : (
                monthly.map((row, i) => (
                  <TableRow key={row.month ?? i}>
                    <TableCell>{formatMonth(row.month)}</TableCell>
                    <TableCell className="text-right">{row.billCount}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(row.revenue ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 products this month</CardTitle>
          <CardDescription>By revenue in the current calendar month.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty Sold</TableHead>
                <TableHead className="text-right">Revenue ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No sales this month yet.
                  </TableCell>
                </TableRow>
              ) : (
                topProducts.map((row, i) => (
                  <TableRow key={row.productId ?? row.productName}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell className="text-right">
                      {Number(row.totalQty ?? 0).toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(row.totalRevenue ?? 0).toFixed(2)}
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
