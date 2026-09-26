import type { Database } from '@mybizone/db';
import { expenseEntries, returnItems, saleItems, sales, salesReturns } from '@mybizone/db';
import { and, eq, gte, lt, ne, sql, sum } from 'drizzle-orm';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Shared by the report and real-database regressions; dates are exclusive at the end.
export async function getProfitLoss(
  tx: Transaction,
  businessId: string,
  fromDate: Date,
  toDate: Date,
) {
  // Revenue: completed gst_bill + non_gst_bill sales (not estimates)
  const revenueRows = await tx
    .select({ total: sql<string>`sum(${sales.total} - ${sales.taxTotal})` })
    .from(sales)
    .where(
      and(
        eq(sales.businessId, businessId),
        eq(sales.status, 'completed'),
        ne(sales.billType, 'estimate'),
        gte(sales.createdAt, fromDate),
        lt(sales.createdAt, toDate),
      ),
    );

  // COGS includes free goods: giving stock away still incurs its saved cost.
  const cogsRows = await tx
    .select({
      cogs: sql<string>`sum(${saleItems.qty}::numeric * ${saleItems.costPriceAtSale}::numeric)`.as(
        'cogs',
      ),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        eq(saleItems.businessId, businessId),
        eq(sales.status, 'completed'),
        ne(sales.billType, 'estimate'),
        gte(sales.createdAt, fromDate),
        lt(sales.createdAt, toDate),
      ),
    );

  // Sales returns
  const returnsRows = await tx
    .select({ total: sql<string>`sum(${salesReturns.total} - ${salesReturns.taxTotal})` })
    .from(salesReturns)
    .where(
      and(
        eq(salesReturns.businessId, businessId),
        eq(salesReturns.status, 'completed'),
        gte(salesReturns.createdAt, fromDate),
        lt(salesReturns.createdAt, toDate),
      ),
    );

  // Goods returned to stock reverse their original cost, not today's cost.
  const [returnedCost] = await tx
    .select({
      total: sql<string>`sum(${returnItems.qty} * ${returnItems.costPriceAtSale})`,
    })
    .from(returnItems)
    .innerJoin(salesReturns, eq(salesReturns.id, returnItems.returnId))
    .where(
      and(
        eq(salesReturns.businessId, businessId),
        eq(salesReturns.status, 'completed'),
        gte(salesReturns.createdAt, fromDate),
        lt(salesReturns.createdAt, toDate),
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
        eq(expenseEntries.businessId, businessId),
        gte(expenseEntries.entryDate, fromDate),
        lt(expenseEntries.entryDate, toDate),
      ),
    )
    .groupBy(expenseEntries.category, expenseEntries.type)
    .orderBy(expenseEntries.category);

  return {
    revenue: Number(revenueRows[0]?.total ?? 0),
    cogs: Number(cogsRows[0]?.cogs ?? 0) - Number(returnedCost?.total ?? 0),
    returns: Number(returnsRows[0]?.total ?? 0),
    expenseByCategory: expenseRows,
  };
}
