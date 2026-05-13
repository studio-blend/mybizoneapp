import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import {
  categories,
  customers,
  expenseEntries,
  products,
  saleItems,
  sales,
  stores,
  suppliers,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, count, desc, eq, gte, lt, ne, sql, sum } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GuidedTour } from './_components/GuidedTour';
import {
  CategoryDonutChart,
  PaymentSplitBar,
  RevenueTrendChart,
  TopProductsBar,
} from './_components/dashboard-charts';

export const dynamic = 'force-dynamic';

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function prevMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return round2(((curr - prev) / prev) * 100);
}

function formatMon(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function fmtAmount(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default async function DashboardPage() {
  const user = await requireUser();

  const setupCheck = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id }).from(stores).limit(1),
  );
  if (setupCheck.length === 0) redirect('/onboarding');

  const now = new Date();
  const thisMonthStart = monthStart(now);
  const prevMthStart = prevMonthStart(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const data = await withTenant(db, user.businessId, async (tx) => {
    // ── Revenue this month + last month ──────────────────────────────────────
    const [revThis] = await tx
      .select({ total: sum(sales.total) })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      );
    const [revPrev] = await tx
      .select({ total: sum(sales.total) })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, prevMthStart),
          lt(sales.createdAt, thisMonthStart),
        ),
      );

    // ── Units sold this month ────────────────────────────────────────────────
    const [unitsSold] = await tx
      .select({ qty: sql<string>`COALESCE(SUM(${saleItems.qty}::numeric),0)` })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      );

    // ── Expenses this month + last month ─────────────────────────────────────
    const [expThis] = await tx
      .select({ total: sum(expenseEntries.amount) })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.businessId, user.businessId),
          eq(expenseEntries.type, 'expense'),
          gte(expenseEntries.entryDate, thisMonthStart),
          lt(expenseEntries.entryDate, nextMonthStart),
        ),
      );
    const [expPrev] = await tx
      .select({ total: sum(expenseEntries.amount) })
      .from(expenseEntries)
      .where(
        and(
          eq(expenseEntries.businessId, user.businessId),
          eq(expenseEntries.type, 'expense'),
          gte(expenseEntries.entryDate, prevMthStart),
          lt(expenseEntries.entryDate, thisMonthStart),
        ),
      );

    // ── COGS this month (for gross profit) ───────────────────────────────────
    const [cogsThis] = await tx
      .select({
        cogs: sql<string>`COALESCE(SUM(${saleItems.qty}::numeric * ${saleItems.costPriceAtSale}::numeric),0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          eq(saleItems.isFreeItem, false),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      );

    // ── Customer counts ───────────────────────────────────────────────────────
    const [custTotal] = await tx
      .select({ cnt: count(customers.id) })
      .from(customers)
      .where(eq(customers.businessId, user.businessId));
    const [custNew] = await tx
      .select({ cnt: count(customers.id) })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, user.businessId),
          gte(customers.createdAt, thisMonthStart),
          lt(customers.createdAt, nextMonthStart),
        ),
      );

    // ── Pending receivables ───────────────────────────────────────────────────
    const [recv] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${customers.outstandingBalance}::numeric),0)` })
      .from(customers)
      .where(
        and(
          eq(customers.businessId, user.businessId),
          sql`${customers.outstandingBalance}::numeric > 0`,
        ),
      );

    // ── Payables ─────────────────────────────────────────────────────────────
    const [payable] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${suppliers.outstandingBalance}::numeric),0)` })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.businessId, user.businessId),
          sql`${suppliers.outstandingBalance}::numeric > 0`,
        ),
      );

    // ── 12-month revenue trend ────────────────────────────────────────────────
    const monthlyRevRaw = await tx
      .select({
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${sales.createdAt}), 'YYYY-MM-DD')`,
        revenue: sum(sales.total),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          sql`${sales.createdAt} >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'`,
        ),
      )
      .groupBy(sql`DATE_TRUNC('month', ${sales.createdAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${sales.createdAt})`);

    // ── Top 5 products this month by revenue ─────────────────────────────────
    const top5Raw = await tx
      .select({
        name: saleItems.productName,
        revenue: sum(saleItems.lineTotal),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      )
      .groupBy(saleItems.productName)
      .orderBy(desc(sum(saleItems.lineTotal)))
      .limit(5);

    // ── Sales by category this month ──────────────────────────────────────────
    const catRaw = await tx
      .select({
        category: categories.name,
        revenue: sum(saleItems.lineTotal),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      )
      .groupBy(categories.name)
      .orderBy(desc(sum(saleItems.lineTotal)));

    // ── Payment method split this month ──────────────────────────────────────
    const pmtRaw = await tx
      .select({
        method: sales.paymentMethod,
        total: sum(sales.total),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          ne(sales.billType, 'estimate'),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, thisMonthStart),
          lt(sales.createdAt, nextMonthStart),
        ),
      )
      .groupBy(sales.paymentMethod)
      .orderBy(desc(sum(sales.total)));

    // ── Tour data ─────────────────────────────────────────────────────────────
    const [productAgg] = await tx
      .select({ total: count(products.id) })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)));

    return {
      revThis: Number(revThis?.total ?? 0),
      revPrev: Number(revPrev?.total ?? 0),
      expThis: Number(expThis?.total ?? 0),
      expPrev: Number(expPrev?.total ?? 0),
      cogsThis: Number(cogsThis?.cogs ?? 0),
      unitsSold: Number(unitsSold?.qty ?? 0),
      custTotal: Number(custTotal?.cnt ?? 0),
      custNew: Number(custNew?.cnt ?? 0),
      receivables: Number(recv?.total ?? 0),
      payables: Number(payable?.total ?? 0),
      monthlyRevRaw,
      top5Raw,
      catRaw,
      pmtRaw,
      productCount: Number(productAgg?.total ?? 0),
    };
  });

  const grossProfit = round2(data.revThis - data.cogsThis);
  const revDelta = pct(data.revThis, data.revPrev);
  const expDelta = pct(data.expThis, data.expPrev);

  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const monthlyRevenue = data.monthlyRevRaw.map((r) => ({
    month: formatMon(r.month),
    revenue: Number(r.revenue ?? 0),
  }));

  const topProducts = data.top5Raw.map((r) => ({
    name: r.name.length > 18 ? r.name.slice(0, 16) + '…' : r.name,
    revenue: Number(r.revenue ?? 0),
  }));

  const categoryData = data.catRaw.map((r) => ({
    name: r.category,
    value: Number(r.revenue ?? 0),
  }));

  const paymentData = data.pmtRaw.map((r) => ({
    method: r.method,
    amount: Number(r.total ?? 0),
  }));

  const hasTour = {
    hasProducts: data.productCount > 0,
    hasSales: data.revThis > 0,
    hasInvoices: false,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <Button asChild>
          <Link href="/sales/new">New sale</Link>
        </Button>
      </div>

      <GuidedTour
        hasProducts={hasTour.hasProducts}
        hasSales={hasTour.hasSales}
        hasInvoices={hasTour.hasInvoices}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Revenue this month"
          value={`₹${fmtAmount(data.revThis)}`}
          delta={revDelta}
          sub="vs last month"
        />
        <KpiCard
          label="Gross Profit"
          value={`₹${fmtAmount(grossProfit)}`}
          sub={`COGS ₹${fmtAmount(data.cogsThis)}`}
        />
        <KpiCard
          label="Expenses this month"
          value={`₹${fmtAmount(data.expThis)}`}
          delta={expDelta !== null ? -expDelta : null}
          sub="vs last month"
          invertDelta
        />
        <KpiCard
          label="Pending Receivables"
          value={`₹${fmtAmount(data.receivables)}`}
          sub="Customer outstanding"
        />
        <KpiCard
          label="Active Customers"
          value={String(data.custTotal)}
          sub={`+${data.custNew} new this month`}
        />
        <KpiCard
          label="Units Sold"
          value={Number(data.unitsSold.toFixed(0)).toLocaleString('en-IN')}
          sub="This month"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>12-Month Revenue Trend</CardTitle>
            <CardDescription>Monthly revenue (last 12 months)</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet.</p>
            ) : (
              <RevenueTrendChart data={monthlyRevenue} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Products</CardTitle>
            <CardDescription>By revenue this month</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No sales this month.</p>
            ) : (
              <TopProductsBar data={topProducts} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
            <CardDescription>Revenue split by product category</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No category data this month.</p>
            ) : (
              <CategoryDonutChart data={categoryData} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Method Split</CardTitle>
            <CardDescription>Revenue by payment type this month</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No payment data this month.</p>
            ) : (
              <PaymentSplitBar data={paymentData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receivables vs Payables */}
      <Card>
        <CardHeader>
          <CardTitle>Receivables vs Payables</CardTitle>
          <CardDescription>Customer outstanding vs supplier outstanding</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Customer Receivables</p>
              <p className="text-2xl font-bold text-green-600">₹{fmtAmount(data.receivables)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Supplier Payables</p>
              <p className="text-2xl font-bold text-red-600">₹{fmtAmount(data.payables)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sub,
  invertDelta = false,
}: {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
  invertDelta?: boolean;
}) {
  const isUp = delta !== null && delta !== undefined && delta > 0;
  const isDown = delta !== null && delta !== undefined && delta < 0;
  const deltaColor = invertDelta
    ? isUp ? 'text-green-600' : isDown ? 'text-red-600' : ''
    : isUp ? 'text-green-600' : isDown ? 'text-red-600' : '';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {delta !== null && delta !== undefined && (
            <span className={`font-medium ${deltaColor}`}>
              {isUp ? '▲' : isDown ? '▼' : ''}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
