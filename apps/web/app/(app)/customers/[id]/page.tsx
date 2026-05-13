import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, openingBalances, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { financialYear } from '@mybizone/domain/bill-series';
import { Button } from '@mybizone/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OpeningBalanceForm } from './_components/opening-balance-form';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, params.id), eq(customers.businessId, user.businessId)));
    if (!customer) return null;

    const fy = financialYear(new Date());
    const [opening] = await tx
      .select()
      .from(openingBalances)
      .where(
        and(
          eq(openingBalances.businessId, user.businessId),
          eq(openingBalances.entityType, 'customer'),
          eq(openingBalances.entityId, customer.id),
          eq(openingBalances.financialYear, fy),
        ),
      );

    const recentSales = await tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        total: sales.total,
        paymentMethod: sales.paymentMethod,
        paymentStatus: sales.paymentStatus,
      })
      .from(sales)
      .where(and(eq(sales.customerId, customer.id), eq(sales.businessId, user.businessId)))
      .orderBy(desc(sales.createdAt))
      .limit(20);

    return { customer, opening, fy, recentSales };
  });

  if (!data) notFound();
  const { customer, opening, fy, recentSales } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {customer.phone ?? 'No phone'} · {customer.email ?? 'No email'}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/customers/${customer.id}/edit`}>Edit</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding</CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xl font-semibold ${
                Number(customer.outstandingBalance) > 0 ? 'text-destructive' : ''
              }`}
            >
              ₹{Number(customer.outstandingBalance).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credit limit</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">₹{Number(customer.creditLimit).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold capitalize">{customer.rateCategory}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opening balance — FY {fy}</CardTitle>
          <CardDescription>
            Carried-forward dues from before MyBizOne started tracking this customer. Counted in
            outstanding reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpeningBalanceForm
            customerId={customer.id}
            financialYear={fy}
            current={opening?.amount ?? '0'}
            notes={opening?.notes ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
          <CardDescription>Last 20 bills for this customer.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total ₹</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No sales recorded.
                  </TableCell>
                </TableRow>
              ) : (
                recentSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.billNo}</TableCell>
                    <TableCell>{new Date(s.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell className="text-right">₹{Number(s.total).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.paymentMethod}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {s.paymentStatus}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sales/${s.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
