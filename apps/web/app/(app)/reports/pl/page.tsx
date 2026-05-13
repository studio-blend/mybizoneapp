import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { expenseEntries, saleItems, sales, salesReturns } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, eq, gte, lte, ne, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { from?: string; to?: string };
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

function Row({ label, amount, indent = false, bold = false }: { label: string; amount: number; indent?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-2 ${indent ? 'pl-6' : ''} ${bold ? 'font-semibold' : ''} border-b last:border-0`}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${amount < 0 ? 'text-red-600' : ''}`}>
        ₹{fmt(amount)}
      </span>
    </div>
  );
}

export default async function PlReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const fromStr = searchParams.from ?? financialYearStart();
  const toStr = searchParams.to ?? todayStr();

  const fromDate = new Date(`${fromStr}T00:00:00`);
  const toDate = new Date(`${toStr}T23:59:59`);

  const { revenue, cogs, returns, expenseByCategory } = await withTenant(
    db,
    user.businessId,
    async (tx) => {
      // Revenue: completed gst_bill + non_gst_bill sales (not estimates)
      const revenueRows = await tx
        .select({ total: sum(sales.total) })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, user.businessId),
            eq(sales.status, 'completed'),
            ne(sales.billType, 'estimate'),
            gte(sales.createdAt, fromDate),
            lte(sales.createdAt, toDate),
          ),
        );

      // COGS: sum of qty × cost_price_at_sale for non-free items
      const cogsRows = await tx
        .select({
          cogs: sql<string>`sum(${saleItems.qty}::numeric * ${saleItems.costPriceAtSale}::numeric)`.as('cogs'),
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(
          and(
            eq(saleItems.businessId, user.businessId),
            eq(sales.status, 'completed'),
            ne(sales.billType, 'estimate'),
            eq(saleItems.isFreeItem, false),
            gte(sales.createdAt, fromDate),
            lte(sales.createdAt, toDate),
          ),
        );

      // Sales returns
      const returnsRows = await tx
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

      // Expenses by category
      const expenseRows = await tx
        .select({
          category: expenseEntries.category,
          type: expenseEntries.type,
          total: sum(expenseEntries.amount),
        })
        .from(expenseEntries)
        .where(
          and(
            eq(expenseEntries.businessId, user.businessId),
            gte(expenseEntries.entryDate, fromDate),
            lte(expenseEntries.entryDate, toDate),
          ),
        )
        .groupBy(expenseEntries.category, expenseEntries.type)
        .orderBy(expenseEntries.category);

      return {
        revenue: Number(revenueRows[0]?.total ?? 0),
        cogs: Number(cogsRows[0]?.cogs ?? 0),
        returns: Number(returnsRows[0]?.total ?? 0),
        expenseByCategory: expenseRows,
      };
    },
  );

  const totalExpenses = expenseByCategory
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => round2(sum + Number(e.total ?? 0)), 0);

  const totalOtherIncome = expenseByCategory
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => round2(sum + Number(e.total ?? 0)), 0);

  const grossProfit = round2(revenue - returns - cogs);
  const netProfit = round2(grossProfit - totalExpenses + totalOtherIncome);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Profit & Loss Report</h1>
          <p className="text-sm text-muted-foreground">{fromStr} to {toStr}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date range filter */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">From</label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">To</label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {/* Revenue */}
      <Card>
        <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
        <CardContent>
          <Row label="Gross Revenue (Sales)" amount={revenue} />
          <Row label="Less: Sales Returns" amount={-returns} indent />
          <Row label="Net Revenue" amount={round2(revenue - returns)} bold />
        </CardContent>
      </Card>

      {/* COGS */}
      <Card>
        <CardHeader><CardTitle>Cost of Goods Sold</CardTitle></CardHeader>
        <CardContent>
          <Row label="Cost of Goods Sold (Purchase Cost)" amount={cogs} />
          <Row label="Gross Profit" amount={grossProfit} bold />
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <CardContent>
          {expenseByCategory.filter((e) => e.type === 'expense').length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No expense entries in this period.</p>
          ) : (
            expenseByCategory
              .filter((e) => e.type === 'expense')
              .map((e) => (
                <Row
                  key={e.category}
                  label={e.category}
                  amount={Number(e.total ?? 0)}
                  indent
                />
              ))
          )}
          <Row label="Total Expenses" amount={totalExpenses} bold />
        </CardContent>
      </Card>

      {/* Other Income */}
      {totalOtherIncome > 0 && (
        <Card>
          <CardHeader><CardTitle>Other Income</CardTitle></CardHeader>
          <CardContent>
            {expenseByCategory
              .filter((e) => e.type === 'income')
              .map((e) => (
                <Row
                  key={e.category}
                  label={e.category}
                  amount={Number(e.total ?? 0)}
                  indent
                />
              ))}
            <Row label="Total Other Income" amount={totalOtherIncome} bold />
          </CardContent>
        </Card>
      )}

      {/* Net Profit */}
      <Card className={netProfit >= 0 ? 'border-green-200' : 'border-red-200'}>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold">Net Profit</span>
            <span className={`text-2xl font-bold tabular-nums ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{fmt(netProfit)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Gross Profit ₹{fmt(grossProfit)} − Expenses ₹{fmt(totalExpenses)}
            {totalOtherIncome > 0 ? ` + Other Income ₹${fmt(totalOtherIncome)}` : ''}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
