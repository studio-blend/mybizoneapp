import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { categories, customers, products, saleItems, sales, salesReturns } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, count, desc, eq, gte, lte, ne, sql, sum } from 'drizzle-orm';
import Link from 'next/link';
import { DailyRevenueChart } from './_components/perf-charts';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { tab?: string; from?: string; to?: string };
}

function financialYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TABS = [
  { key: 'sales', label: 'Sales' },
  { key: 'customer', label: 'Customers' },
  { key: 'category', label: 'Categories' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default async function PerformancePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const tab: TabKey = (searchParams.tab as TabKey) ?? 'sales';
  const fromStr = searchParams.from ?? financialYearStart();
  const toStr = searchParams.to ?? todayStr();
  const fromDate = new Date(`${fromStr}T00:00:00`);
  const toDate = new Date(`${toStr}T23:59:59`);

  const data = await withTenant(db, user.businessId, async (tx) => {
    // ── Sales performance ────────────────────────────────────────────────────
    const dailySalesRaw = await tx
      .select({
        date: sql<string>`TO_CHAR(${sales.createdAt}::date, 'DD-Mon')`,
        bills: count(sales.id),
        revenue: sum(sales.total),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      )
      .groupBy(sql`${sales.createdAt}::date`)
      .orderBy(asc(sql`${sales.createdAt}::date`));

    const [returnAgg] = await tx
      .select({ total: sum(salesReturns.total) })
      .from(salesReturns)
      .where(
        and(
          eq(salesReturns.businessId, user.businessId),
          eq(salesReturns.status, 'completed'),
          gte(salesReturns.createdAt, fromDate),
          lte(salesReturns.createdAt, toDate),
        ),
      );

    // ── Customer performance ──────────────────────────────────────────────────
    const topCustomersRaw = await tx
      .select({
        customerId: sales.customerId,
        customerName: sales.customerName,
        orders: count(sales.id),
        revenue: sum(sales.total),
        lastPurchase: sql<string>`MAX(${sales.createdAt}::date)::text`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      )
      .groupBy(sales.customerId, sales.customerName)
      .orderBy(desc(sum(sales.total)))
      .limit(25);

    // Get outstanding balances for top customers
    const customerIds = topCustomersRaw
      .map((c) => c.customerId)
      .filter(Boolean) as string[];

    const outstandingMap: Record<string, number> = {};
    if (customerIds.length > 0) {
      const custRows = await tx
        .select({ id: customers.id, outstanding: customers.outstandingBalance })
        .from(customers)
        .where(eq(customers.businessId, user.businessId));
      for (const c of custRows) {
        outstandingMap[c.id] = Number(c.outstanding ?? 0);
      }
    }

    // ── Category performance ──────────────────────────────────────────────────
    const catRaw = await tx
      .select({
        categoryName: categories.name,
        unitsSold: sum(saleItems.qty),
        revenue: sum(saleItems.lineTotal),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      )
      .groupBy(categories.name)
      .orderBy(desc(sum(saleItems.lineTotal)));

    return {
      dailySalesRaw,
      returnsTotal: Number(returnAgg?.total ?? 0),
      topCustomersRaw,
      outstandingMap,
      catRaw,
    };
  });

  // ── Sales summary ───────────────────────────────────────────────────────────
  const totalBills = data.dailySalesRaw.reduce((s, r) => s + Number(r.bills), 0);
  const totalRevenue = data.dailySalesRaw.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const avgOrderValue = totalBills > 0 ? round2(totalRevenue / totalBills) : 0;
  const topDay = data.dailySalesRaw.reduce(
    (best, r) => (Number(r.revenue ?? 0) > Number(best.revenue ?? 0) ? r : best),
    data.dailySalesRaw[0] ?? { date: '—', revenue: '0', bills: 0 },
  );

  const dailyChartData = data.dailySalesRaw.map((r) => ({
    date: r.date,
    revenue: Number(r.revenue ?? 0),
  }));

  // ── Category totals for % ───────────────────────────────────────────────────
  const catTotal = data.catRaw.reduce((s, r) => s + Number(r.revenue ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Performance Reports</h1>
          <p className="text-sm text-muted-foreground">
            {fromStr} to {toStr}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date range filter */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value={tab} />
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}&from=${fromStr}&to=${toStr}`}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Sales Tab ── */}
      {tab === 'sales' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Total Bills</p>
                <p className="text-2xl font-bold">{totalBills}</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">₹{fmt(totalRevenue)}</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold">₹{fmt(avgOrderValue)}</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs text-muted-foreground">Top Day</p>
                <p className="text-lg font-bold">{topDay?.date ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  ₹{fmt(Number(topDay?.revenue ?? 0))}
                </p>
              </CardHeader>
            </Card>
          </div>

          {dailyChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyRevenueChart data={dailyChartData} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Revenue ₹</TableHead>
                    <TableHead className="text-right">Returns ₹</TableHead>
                    <TableHead className="text-right">Net Revenue ₹</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dailySalesRaw.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No sales in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.dailySalesRaw.map((r, i) => {
                      const rev = Number(r.revenue ?? 0);
                      return (
                        <TableRow key={i}>
                          <TableCell>{r.date}</TableCell>
                          <TableCell className="text-right">{r.bills}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rev)}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">—</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmt(rev)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  {data.dailySalesRaw.length > 0 && (
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totalBills}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totalRevenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {fmt(data.returnsTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(round2(totalRevenue - data.returnsTotal))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Customer Tab ── */}
      {tab === 'customer' && (
        <Card>
          <CardHeader>
            <CardTitle>Top 25 Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue ₹</TableHead>
                  <TableHead>Last Purchase</TableHead>
                  <TableHead className="text-right">Outstanding ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topCustomersRaw.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No sales in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topCustomersRaw.map((c, i) => {
                    const outstanding = c.customerId
                      ? (data.outstandingMap[c.customerId] ?? 0)
                      : 0;
                    return (
                      <TableRow key={c.customerId ?? i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {c.customerId ? (
                            <Link href={`/customers/${c.customerId}`} className="hover:underline">
                              {c.customerName ?? 'Walk-in'}
                            </Link>
                          ) : (
                            c.customerName ?? 'Walk-in'
                          )}
                        </TableCell>
                        <TableCell className="text-right">{c.orders}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(Number(c.revenue ?? 0))}
                        </TableCell>
                        <TableCell className="text-sm">{c.lastPurchase ?? '—'}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${outstanding > 0 ? 'font-medium text-orange-600' : 'text-muted-foreground'}`}
                        >
                          {outstanding > 0 ? fmt(outstanding) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Category Tab ── */}
      {tab === 'category' && (
        <Card>
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units Sold</TableHead>
                  <TableHead className="text-right">Revenue ₹</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.catRaw.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No sales in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.catRaw.map((r, i) => {
                    const rev = Number(r.revenue ?? 0);
                    const pct = catTotal > 0 ? ((rev / catTotal) * 100).toFixed(1) : '0.0';
                    return (
                      <TableRow key={r.categoryName ?? i}>
                        <TableCell className="font-medium">
                          {r.categoryName ?? 'Uncategorised'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(r.unitsSold ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(rev)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct}%</TableCell>
                      </TableRow>
                    );
                  })
                )}
                {data.catRaw.length > 0 && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(catTotal)}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
