import {
  type Database,
  categories,
  customers,
  expenseEntries,
  products,
  saleItems,
  sales,
  suppliers,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, count, desc, eq, gte, lt, ne, sql, sum } from 'drizzle-orm';

export async function loadDashboardData(db: Database, businessId: string, now = new Date()) {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return withTenant(db, businessId, async (tx) => {
    const [
      [revenue],
      [items],
      [expenses],
      [customerAgg],
      [payable],
      monthlyRevRaw,
      top5Raw,
      catRaw,
      pmtRaw,
      [productAgg],
    ] = await Promise.all([
      // One bounded scan for both months instead of two database round-trips.
      tx
        .select({
          thisMonth: sql<string>`COALESCE(SUM(${sales.total}) FILTER (WHERE ${gte(sales.createdAt, thisMonthStart)}), 0)`,
          prevMonth: sql<string>`COALESCE(SUM(${sales.total}) FILTER (WHERE ${lt(sales.createdAt, thisMonthStart)}), 0)`,
        })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, prevMthStart),
            lt(sales.createdAt, nextMonthStart),
          ),
        ),
      // Free items still count as units, but contribute no COGS.
      tx
        .select({
          qty: sql<string>`COALESCE(SUM(${saleItems.qty}), 0)`,
          cogs: sql<string>`COALESCE(SUM(${saleItems.qty} * ${saleItems.costPriceAtSale}) FILTER (WHERE ${saleItems.isFreeItem} = false), 0)`,
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(
          and(
            eq(saleItems.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, thisMonthStart),
            lt(sales.createdAt, nextMonthStart),
          ),
        ),
      // Both expense totals share the same business/type/date scan.
      tx
        .select({
          thisMonth: sql<string>`COALESCE(SUM(${expenseEntries.amount}) FILTER (WHERE ${gte(expenseEntries.entryDate, thisMonthStart)}), 0)`,
          prevMonth: sql<string>`COALESCE(SUM(${expenseEntries.amount}) FILTER (WHERE ${lt(expenseEntries.entryDate, thisMonthStart)}), 0)`,
        })
        .from(expenseEntries)
        .where(
          and(
            eq(expenseEntries.businessId, businessId),
            eq(expenseEntries.type, 'expense'),
            gte(expenseEntries.entryDate, prevMthStart),
            lt(expenseEntries.entryDate, nextMonthStart),
          ),
        ),
      // Counts and receivables require just one customer scan.
      tx
        .select({
          total: count(customers.id),
          newThisMonth:
            sql<number>`COUNT(*) FILTER (WHERE ${and(gte(customers.createdAt, thisMonthStart), lt(customers.createdAt, nextMonthStart))})`.mapWith(
              Number,
            ),
          receivables: sql<string>`COALESCE(SUM(${customers.outstandingBalance}) FILTER (WHERE ${customers.outstandingBalance} > 0), 0)`,
        })
        .from(customers)
        .where(eq(customers.businessId, businessId)),
      // Payables
      tx
        .select({ total: sql<string>`COALESCE(SUM(${suppliers.outstandingBalance}::numeric),0)` })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.businessId, businessId),
            sql`${suppliers.outstandingBalance}::numeric > 0`,
          ),
        ),
      // 12-month revenue trend
      tx
        .select({
          month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${sales.createdAt}), 'YYYY-MM-DD')`,
          revenue: sum(sales.total),
        })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            sql`${sales.createdAt} >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'`,
          ),
        )
        .groupBy(sql`DATE_TRUNC('month', ${sales.createdAt})`)
        .orderBy(sql`DATE_TRUNC('month', ${sales.createdAt})`),
      // Top 5 products this month
      tx
        .select({ name: saleItems.productName, revenue: sum(saleItems.lineTotal) })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(
          and(
            eq(saleItems.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, thisMonthStart),
            lt(sales.createdAt, nextMonthStart),
          ),
        )
        .groupBy(saleItems.productName)
        .orderBy(desc(sum(saleItems.lineTotal)))
        .limit(5),
      // Sales by category this month
      tx
        .select({ category: categories.name, revenue: sum(saleItems.lineTotal) })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .innerJoin(products, eq(products.id, saleItems.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(saleItems.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, thisMonthStart),
            lt(sales.createdAt, nextMonthStart),
          ),
        )
        .groupBy(categories.name)
        .orderBy(desc(sum(saleItems.lineTotal))),
      // Payment method split this month
      tx
        .select({ method: sales.paymentMethod, total: sum(sales.total) })
        .from(sales)
        .where(
          and(
            eq(sales.businessId, businessId),
            ne(sales.billType, 'estimate'),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, thisMonthStart),
            lt(sales.createdAt, nextMonthStart),
          ),
        )
        .groupBy(sales.paymentMethod)
        .orderBy(desc(sum(sales.total))),
      // Product count (tour)
      tx
        .select({ total: count(products.id) })
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.active, true))),
    ]);

    return {
      revThis: Number(revenue?.thisMonth ?? 0),
      revPrev: Number(revenue?.prevMonth ?? 0),
      expThis: Number(expenses?.thisMonth ?? 0),
      expPrev: Number(expenses?.prevMonth ?? 0),
      cogsThis: Number(items?.cogs ?? 0),
      unitsSold: Number(items?.qty ?? 0),
      custTotal: customerAgg?.total ?? 0,
      custNew: customerAgg?.newThisMonth ?? 0,
      receivables: Number(customerAgg?.receivables ?? 0),
      payables: Number(payable?.total ?? 0),
      monthlyRevRaw,
      top5Raw,
      catRaw,
      pmtRaw,
      productCount: Number(productAgg?.total ?? 0),
    };
  });
}
