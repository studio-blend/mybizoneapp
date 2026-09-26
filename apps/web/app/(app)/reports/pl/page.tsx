import { db } from '@/lib/db';
import { validStockDate } from '@/lib/reports/closing-stock';
import { getProfitLoss } from '@/lib/reports/profit-loss';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
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

function Row({
  label,
  amount,
  indent = false,
  bold = false,
}: { label: string; amount: number; indent?: boolean; bold?: boolean }) {
  return (
    <div
      className={`flex justify-between py-2 ${indent ? 'pl-6' : ''} ${bold ? 'font-semibold' : ''} border-b last:border-0`}
    >
      <span className="text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${amount < 0 ? 'text-red-600' : ''}`}>
        ₹{fmt(amount)}
      </span>
    </div>
  );
}

export default async function PlReportPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  await requirePermission(user, 'view_reports');
  const fromStr =
    searchParams.from && validStockDate(searchParams.from)
      ? searchParams.from
      : financialYearStart();
  const toStr = searchParams.to && validStockDate(searchParams.to) ? searchParams.to : todayStr();

  const fromDate = new Date(`${fromStr}T00:00:00+05:30`);
  const toDate = new Date(new Date(`${toStr}T00:00:00+05:30`).getTime() + 86_400_000);

  const { revenue, cogs, returns, expenseByCategory } = await withTenant(
    db,
    user.businessId,
    async (tx) => {
      return getProfitLoss(tx, user.businessId, fromDate, toDate);
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
          <p className="text-sm text-muted-foreground">
            {fromStr} to {toStr} (India time). Sales and returns exclude GST. Missing cost prices
            are excluded from cost of goods.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date range filter */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
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

      {/* Revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Gross Revenue (Sales)" amount={revenue} />
          <Row label="Less: Sales Returns" amount={-returns} indent />
          <Row label="Net Revenue" amount={round2(revenue - returns)} bold />
        </CardContent>
      </Card>

      {/* COGS */}
      <Card>
        <CardHeader>
          <CardTitle>Cost of Goods Sold</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Cost of Goods Sold (Purchase Cost)" amount={cogs} />
          <Row label="Gross Profit" amount={grossProfit} bold />
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenseByCategory.filter((e) => e.type === 'expense').length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No expense entries in this period.</p>
          ) : (
            expenseByCategory
              .filter((e) => e.type === 'expense')
              .map((e) => (
                <Row key={e.category} label={e.category} amount={Number(e.total ?? 0)} indent />
              ))
          )}
          <Row label="Total Expenses" amount={totalExpenses} bold />
        </CardContent>
      </Card>

      {/* Other Income */}
      {totalOtherIncome > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other Income</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseByCategory
              .filter((e) => e.type === 'income')
              .map((e) => (
                <Row key={e.category} label={e.category} amount={Number(e.total ?? 0)} indent />
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
            <span
              className={`text-2xl font-bold tabular-nums ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
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
