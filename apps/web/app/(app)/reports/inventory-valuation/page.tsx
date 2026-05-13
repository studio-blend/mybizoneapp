import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { categories, products } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, eq, gt, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { view?: string };
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function InventoryValuationPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const view = searchParams.view === 'category' ? 'category' : 'product';

  const { byProduct, byCategory, totalValue } = await withTenant(
    db,
    user.businessId,
    async (tx) => {
      // By product: use products.inventory (live stock) × cost_price
      const productRows = await tx
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          unitSymbol: products.unitSymbol,
          qty: products.inventory,
          costPrice: products.costPrice,
          categoryName: categories.name,
        })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
        .orderBy(asc(products.name));

      // By category: aggregate
      const catRows = await tx
        .select({
          categoryName: categories.name,
          totalQty: sum(products.inventory).as('total_qty'),
          avgCost: sql<string>`ROUND(AVG(${products.costPrice}::numeric),2)`.as('avg_cost'),
          totalValue: sql<string>`ROUND(SUM(${products.inventory}::numeric * COALESCE(${products.costPrice}::numeric,0)),2)`.as('total_value'),
        })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(and(eq(products.businessId, user.businessId), eq(products.active, true)))
        .groupBy(categories.name)
        .orderBy(sql`SUM(${products.inventory}::numeric * COALESCE(${products.costPrice}::numeric,0)) DESC`);

      let totalValue = 0;
      const enrichedProducts = productRows.map((p) => {
        const qty = Number(p.qty ?? 0);
        const cost = Number(p.costPrice ?? 0);
        const val = round2(qty * cost);
        totalValue = round2(totalValue + val);
        return { ...p, qty, cost, val };
      });

      return { byProduct: enrichedProducts, byCategory: catRows, totalValue };
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory Valuation</h1>
          <p className="text-sm text-muted-foreground">
            Current stock valuation (weighted average cost)
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Total value card */}
      <Card className="border-green-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Inventory Value</p>
              <p className="text-3xl font-bold text-green-700">₹{fmt(totalValue)}</p>
            </div>
            <div className="text-sm text-muted-foreground text-right">
              <p>{byProduct.length} active products</p>
              <p>{byProduct.filter((p) => p.qty > 0).length} in stock</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View switcher */}
      <div className="flex gap-2">
        <Link
          href="?view=product"
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === 'product'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          By Product
        </Link>
        <Link
          href="?view=category"
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === 'category'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          By Category
        </Link>
      </div>

      {view === 'product' ? (
        <Card>
          <CardHeader>
            <CardTitle>By Product</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Current Qty</TableHead>
                  <TableHead className="text-right">Cost Price ₹</TableHead>
                  <TableHead className="text-right">Stock Value ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byProduct.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No active products.
                    </TableCell>
                  </TableRow>
                ) : (
                  byProduct.map((p) => (
                    <TableRow key={p.id} className={p.qty <= 0 ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">
                        <Link href={`/products/${p.id}/edit`} className="hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku ?? '—'}</TableCell>
                      <TableCell>{p.categoryName ?? '—'}</TableCell>
                      <TableCell>{p.unitSymbol}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.qty.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {p.qty > 0 ? fmt(p.val) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {byProduct.length > 0 && (
              <div className="flex justify-end border-t p-4">
                <span className="text-sm font-semibold">
                  Total: ₹{fmt(totalValue)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Avg Cost ₹</TableHead>
                  <TableHead className="text-right">Total Value ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No data.
                    </TableCell>
                  </TableRow>
                ) : (
                  byCategory.map((row, i) => (
                    <TableRow key={row.categoryName ?? i}>
                      <TableCell className="font-medium">{row.categoryName ?? 'Uncategorised'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.totalQty ?? 0).toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(Number(row.avgCost ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(Number(row.totalValue ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {byCategory.length > 0 && (
              <div className="flex justify-end border-t p-4">
                <span className="text-sm font-semibold">
                  Total: ₹{fmt(totalValue)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
