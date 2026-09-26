import { db } from '@/lib/db';
import { getClosingStock, validStockDate } from '@/lib/reports/closing-stock';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ asOfDate?: string; category?: string }>;
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ClosingStockPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  await requirePermission(user, 'view_reports');
  const suppliedDate = searchParams.asOfDate ?? '';
  const invalidDate = !!suppliedDate && !validStockDate(suppliedDate);
  const asOfDate = suppliedDate && !invalidDate ? suppliedDate : todayStr();
  const categoryFilter = searchParams.category ?? '';

  const rows = await withTenant(db, user.businessId, (tx) => getClosingStock(tx, asOfDate));

  const allCategories = [
    ...new Set(rows.map((r) => r.category_name).filter(Boolean)),
  ].sort() as string[];

  const filtered = categoryFilter ? rows.filter((r) => r.category_name === categoryFilter) : rows;

  let totalStockValue = 0;
  const enriched = filtered.map((r) => {
    const qty = Number(r.closing_qty ?? 0);
    const cost = Number(r.cost_price ?? 0);
    const value = round2(qty > 0 ? qty * cost : 0);
    totalStockValue = round2(totalStockValue + value);
    return { ...r, qty, cost, value };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Closing Stock Report</h1>
          <p className="text-sm text-muted-foreground">
            Stock position at the end of {asOfDate} (India time)
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Valued at current cost prices. Historical quantities include recorded stock movements and
        stock adjustments.
      </p>
      {invalidDate && (
        <p role="alert" className="text-sm text-red-600">
          Invalid date. Showing today&apos;s stock.
        </p>
      )}
      {rows.some((row) => row.incomplete_adjustments > 0) && (
        <p role="alert" className="text-sm text-amber-700">
          Some older product edits lack stock adjustment details. Reconcile those products before
          using this historical report for accounting.
        </p>
      )}
      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="asOfDate" className="text-xs font-medium text-muted-foreground">
            As of Date
          </label>
          <input
            id="asOfDate"
            type="date"
            name="asOfDate"
            defaultValue={asOfDate}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs font-medium text-muted-foreground">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Categories</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs text-muted-foreground">Total Products</p>
            <p className="text-2xl font-bold">{enriched.length}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs text-muted-foreground">In Stock</p>
            <p className="text-2xl font-bold">{enriched.filter((r) => r.qty > 0).length}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs text-muted-foreground">Total Stock Value</p>
            <p className="text-2xl font-bold text-green-700">₹{fmt(totalStockValue)}</p>
          </CardHeader>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock Details — as of {asOfDate}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Closing Qty</TableHead>
                <TableHead className="text-right">Cost Price ₹</TableHead>
                <TableHead className="text-right">Stock Value ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                enriched.map((r) => (
                  <TableRow key={r.id} className={r.qty <= 0 ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      <Link href={`/products/${r.id}/edit`} className="hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.sku ?? '—'}</TableCell>
                    <TableCell>{r.category_name ?? '—'}</TableCell>
                    <TableCell>{r.unit_symbol}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${r.qty < 0 ? 'text-red-600' : ''}`}
                    >
                      {r.qty.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.qty > 0 ? fmt(r.value) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {enriched.length > 0 && (
            <div className="flex justify-end border-t p-4">
              <span className="text-sm font-semibold">
                Total Stock Value: ₹{fmt(totalStockValue)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
