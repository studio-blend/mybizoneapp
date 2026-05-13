import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, expenseEntries, openingBalances, products, saleItems, sales, salesReturns, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { round2 } from '@mybizone/domain/money';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, eq, gt, gte, lt, ne, sql, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { asOf?: string };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionRow({ label, amount, indent = false, bold = false }: { label: string; amount: number; indent?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-2 ${indent ? 'pl-6' : ''} ${bold ? 'font-semibold' : ''} border-b last:border-0`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">₹{fmt(amount)}</span>
    </div>
  );
}

export default async function BalanceSheetPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const asOfStr = searchParams.asOf ?? todayStr();
  const asOfDate = new Date(`${asOfStr}T23:59:59`);

  const data = await withTenant(db, user.businessId, async (tx) => {
    // Stock value: products inventory × cost_price
    const stockRows = await tx
      .select({
        stockValue: sql<string>`sum(${products.inventory}::numeric * coalesce(${products.costPrice}::numeric, ${products.price}::numeric))`.as('stock_value'),
      })
      .from(products)
      .where(eq(products.businessId, user.businessId));

    // Trade receivables: customers with positive outstanding
    const receivablesRows = await tx
      .select({ total: sql<string>`sum(${customers.outstandingBalance}::numeric)`.as('total') })
      .from(customers)
      .where(and(eq(customers.businessId, user.businessId), gt(customers.outstandingBalance, '0')));

    // Opening balances - customers (positive = they owe us)
    const obCustomerRows = await tx
      .select({ total: sql<string>`sum(${openingBalances.amount}::numeric)`.as('total') })
      .from(openingBalances)
      .where(
        and(
          eq(openingBalances.businessId, user.businessId),
          eq(openingBalances.entityType, 'customer'),
          gt(openingBalances.amount, '0'),
        ),
      );

    // Trade payables: suppliers with positive outstanding
    const payablesRows = await tx
      .select({ total: sql<string>`sum(${suppliers.outstandingBalance}::numeric)`.as('total') })
      .from(suppliers)
      .where(and(eq(suppliers.businessId, user.businessId), gt(suppliers.outstandingBalance, '0')));

    // Opening balances - suppliers (positive = we owe them)
    const obSupplierRows = await tx
      .select({ total: sql<string>`sum(${openingBalances.amount}::numeric)`.as('total') })
      .from(openingBalances)
      .where(
        and(
          eq(openingBalances.businessId, user.businessId),
          eq(openingBalances.entityType, 'supplier'),
          gt(openingBalances.amount, '0'),
        ),
      );

    // Retained earnings: cumulative net profit (revenue - cogs - expenses) up to asOfDate
    const revenueRows = await tx
      .select({ total: sum(sales.total) })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          eq(sales.status, 'completed'),
          ne(sales.billType, 'estimate'),
          lt(sales.createdAt, asOfDate),
        ),
      );

    const cogsRows = await tx
      .select({
        cogs: sql<string>`sum(${saleItems.qty}::numeric * coalesce(${saleItems.costPriceAtSale}::numeric, 0))`.as('cogs'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          eq(sales.status, 'completed'),
          ne(sales.billType, 'estimate'),
          eq(saleItems.isFreeItem, false),
          lt(sales.createdAt, asOfDate),
        ),
      );

    const returnsRows = await tx
      .select({ total: sum(salesReturns.total) })
      .from(salesReturns)
      .where(
        and(
          eq(salesReturns.businessId, user.businessId),
          eq(salesReturns.status, 'completed'),
          lt(salesReturns.createdAt, asOfDate),
        ),
      );

    const expensesRows = await tx
      .select({ total: sql<string>`sum(case when ${expenseEntries.type}='expense' then ${expenseEntries.amount}::numeric else -${expenseEntries.amount}::numeric end)`.as('total') })
      .from(expenseEntries)
      .where(and(eq(expenseEntries.businessId, user.businessId), gte(expenseEntries.entryDate, new Date('2000-01-01')), lt(expenseEntries.entryDate, asOfDate)));

    return {
      stockValue: Number(stockRows[0]?.stockValue ?? 0),
      tradeReceivables: Number(receivablesRows[0]?.total ?? 0),
      obCustomer: Number(obCustomerRows[0]?.total ?? 0),
      tradePayables: Number(payablesRows[0]?.total ?? 0),
      obSupplier: Number(obSupplierRows[0]?.total ?? 0),
      cumulativeRevenue: Number(revenueRows[0]?.total ?? 0),
      cumulativeCogs: Number(cogsRows[0]?.cogs ?? 0),
      cumulativeReturns: Number(returnsRows[0]?.total ?? 0),
      cumulativeExpenses: Number(expensesRows[0]?.total ?? 0),
    };
  });

  const retainedEarnings = round2(
    data.cumulativeRevenue - data.cumulativeReturns - data.cumulativeCogs - data.cumulativeExpenses,
  );

  const totalAssets = round2(data.stockValue + data.tradeReceivables + data.obCustomer);
  const totalLiabilities = round2(data.tradePayables + data.obSupplier);
  const totalEquity = retainedEarnings;
  const liabilitiesPlusEquity = round2(totalLiabilities + totalEquity);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Simplified Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">As of {asOfStr}</p>
          <p className="text-xs text-muted-foreground mt-1">Management view — not an audited financial statement</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date selector */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="asOf" className="text-xs font-medium text-muted-foreground">As of Date</label>
          <input
            id="asOf"
            type="date"
            name="asOf"
            defaultValue={asOfStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assets */}
        <Card>
          <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
          <CardContent>
            <SectionRow label="Stock Value (Inventory)" amount={data.stockValue} />
            <SectionRow label="Trade Receivables (Customers)" amount={data.tradeReceivables} indent />
            <SectionRow label="Opening Bal. (Customers)" amount={data.obCustomer} indent />
            <SectionRow label="Total Assets" amount={totalAssets} bold />
          </CardContent>
        </Card>

        {/* Liabilities + Equity */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Liabilities</CardTitle></CardHeader>
            <CardContent>
              <SectionRow label="Trade Payables (Suppliers)" amount={data.tradePayables} />
              <SectionRow label="Opening Bal. (Suppliers)" amount={data.obSupplier} indent />
              <SectionRow label="Total Liabilities" amount={totalLiabilities} bold />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Equity</CardTitle></CardHeader>
            <CardContent>
              <SectionRow label="Retained Earnings" amount={retainedEarnings} />
              <SectionRow label="Total Equity" amount={totalEquity} bold />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Balance check */}
      <Card className={Math.abs(totalAssets - liabilitiesPlusEquity) < 0.01 ? 'border-green-200' : 'border-yellow-200'}>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Total Assets</span>
            <span className="text-sm tabular-nums font-semibold">₹{fmt(totalAssets)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm font-semibold">Liabilities + Equity</span>
            <span className="text-sm tabular-nums font-semibold">₹{fmt(liabilitiesPlusEquity)}</span>
          </div>
          {Math.abs(totalAssets - liabilitiesPlusEquity) >= 0.01 && (
            <p className="text-xs text-yellow-700 mt-2">
              Note: Balance sheet does not balance by ₹{fmt(Math.abs(totalAssets - liabilitiesPlusEquity))} — some transactions may use cash/bank accounts not tracked here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
