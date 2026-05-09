import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { invoices, products, sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, count, desc, eq, gte, lt, sql, sum } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GuidedTour } from './_components/GuidedTour';

export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = '5';

export default async function DashboardPage() {
  const user = await requireUser();
  // Funnel fresh signups through the onboarding wizard until at least one store exists.
  const setupCheck = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id }).from(stores).limit(1),
  );
  if (setupCheck.length === 0) redirect('/onboarding');
  const data = await withTenant(db, user.businessId, async (tx) => {
    const storeRows = await tx.select({ id: stores.id, name: stores.name }).from(stores);
    if (storeRows.length === 0) {
      return { storeRows, kpis: null, recent: [], lowStock: [], tour: { hasProducts: false, hasSales: false, hasInvoices: false } };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's KPIs — single GROUP BY query is the cheap path here.
    const [todayAgg] = await tx
      .select({
        salesCount: count(sales.id),
        revenue: sum(sales.total),
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          gte(sales.createdAt, today),
          lt(sales.createdAt, tomorrow),
          eq(sales.status, 'completed'),
        ),
      );

    const [productAgg] = await tx
      .select({ total: count(products.id) })
      .from(products)
      .where(and(eq(products.businessId, user.businessId), eq(products.active, true)));

    const lowStock = await tx
      .select({
        id: products.id,
        name: products.name,
        inventory: products.inventory,
        unitSymbol: products.unitSymbol,
        storeName: stores.name,
      })
      .from(products)
      .leftJoin(stores, eq(stores.id, products.storeId))
      .where(
        and(
          eq(products.businessId, user.businessId),
          eq(products.active, true),
          sql`${products.inventory} <= ${LOW_STOCK_THRESHOLD}`,
        ),
      )
      .orderBy(products.inventory)
      .limit(8);

    const recent = await tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        total: sales.total,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
      })
      .from(sales)
      .where(eq(sales.businessId, user.businessId))
      .orderBy(desc(sales.createdAt))
      .limit(5);

    const [invoiceAgg] = await tx
      .select({ total: count(invoices.id) })
      .from(invoices)
      .where(eq(invoices.businessId, user.businessId));

    return {
      storeRows,
      kpis: {
        todaySales: Number(todayAgg?.salesCount ?? 0),
        todayRevenue: todayAgg?.revenue ?? '0',
        productCount: Number(productAgg?.total ?? 0),
        lowStockCount: lowStock.length,
      },
      recent,
      lowStock,
      tour: {
        hasProducts: Number(productAgg?.total ?? 0) > 0,
        hasSales: Number(todayAgg?.salesCount ?? 0) > 0 || recent.length > 0,
        hasInvoices: Number(invoiceAgg?.total ?? 0) > 0,
      },
    };
  });

  if (data.storeRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {user.name}</CardTitle>
          <CardDescription>Set up your first store to start tracking inventory.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/stores/new">Create your first store</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {data.storeRows.length} {data.storeRows.length === 1 ? 'store' : 'stores'} ·{' '}
            {k?.productCount ?? 0} active products
          </p>
        </div>
        <Button asChild>
          <Link href="/sales/new">New sale</Link>
        </Button>
      </div>

      <GuidedTour
        hasProducts={data.tour.hasProducts}
        hasSales={data.tour.hasSales}
        hasInvoices={data.tour.hasInvoices}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue today" value={`₹ ${formatMoney(k?.todayRevenue)}`} />
        <Kpi label="Sales today" value={String(k?.todaySales ?? 0)} />
        <Kpi label="Active products" value={String(k?.productCount ?? 0)} />
        <Kpi label="Low stock items" value={String(k?.lowStockCount ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
            <CardDescription>Last 5 bills.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <Link href={`/sales/${s.id}`} className="font-mono text-xs hover:underline">
                      {s.billNo}
                    </Link>
                    <span className="text-muted-foreground">{s.customerName ?? '—'}</span>
                    <span>₹ {s.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
            <CardDescription>
              Inventory at or below {LOW_STOCK_THRESHOLD} units. Re-stock or hide via product edit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products well-stocked.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <Link href={`/products/${p.id}/edit`} className="hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-muted-foreground">{p.storeName ?? '—'}</span>
                    <span>
                      {p.inventory} {p.unitSymbol}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function formatMoney(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}
