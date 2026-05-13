import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { asOfDate?: string; category?: string };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface StockRow {
  id: string;
  name: string;
  sku: string | null;
  unit_symbol: string;
  category_name: string | null;
  cost_price: string | null;
  closing_qty: string;
}

export default async function ClosingStockPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const asOfDate = searchParams.asOfDate ?? todayStr();
  const categoryFilter = searchParams.category ?? '';

  const rows = await withTenant(db, user.businessId, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await tx.execute(sql`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.unit_symbol,
        c.name AS category_name,
        p.cost_price,
        COALESCE(pi_sum.qty, 0)
          - COALESCE(si_sum.qty, 0)
          + COALESCE(pri_sum.qty, 0)
          - COALESCE(dl_sum.qty, 0)
          AS closing_qty
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT pi.product_id, SUM(pi.qty::numeric) AS qty
        FROM purchase_items pi
        JOIN purchases pu ON pi.purchase_id = pu.id
        WHERE pu.purchase_date::date <= ${asOfDate}::date
        GROUP BY pi.product_id
      ) pi_sum ON pi_sum.product_id = p.id
      LEFT JOIN (
        SELECT si.product_id, SUM(si.qty::numeric) AS qty
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.created_at::date <= ${asOfDate}::date
          AND s.bill_type != 'estimate'
          AND s.status = 'completed'
        GROUP BY si.product_id
      ) si_sum ON si_sum.product_id = p.id
      LEFT JOIN (
        SELECT pri.product_id, SUM(pri.qty::numeric) AS qty
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pri.return_id = pr.id
        WHERE pr.created_at::date <= ${asOfDate}::date
          AND pr.status = 'completed'
        GROUP BY pri.product_id
      ) pri_sum ON pri_sum.product_id = p.id
      LEFT JOIN (
        SELECT dl.product_id, SUM(dl.qty::numeric) AS qty
        FROM damage_logs dl
        WHERE dl.logged_at::date <= ${asOfDate}::date
        GROUP BY dl.product_id
      ) dl_sum ON dl_sum.product_id = p.id
      WHERE p.business_id = current_setting('app.business_id')::uuid
        AND p.active = true
      ORDER BY p.name
    `);
    // drizzle node-postgres execute returns QueryResult which has .rows
    return (result?.rows ?? result) as StockRow[];
  });

  const allCategories = [...new Set(rows.map((r) => r.category_name).filter(Boolean))].sort() as string[];

  const filtered = categoryFilter
    ? rows.filter((r) => r.category_name === categoryFilter)
    : rows;

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
          <p className="text-sm text-muted-foreground">Stock position as of {asOfDate}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

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
              <span className="text-sm font-semibold">Total Stock Value: ₹{fmt(totalStockValue)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
