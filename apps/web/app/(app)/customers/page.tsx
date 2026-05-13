import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc, eq, sum } from 'drizzle-orm';
import Link from 'next/link';
import { DeleteCustomerButton } from './_components/delete-button';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const user = await requireUser();

  const [rows, totals] = await withTenant(db, user.businessId, async (tx) => {
    const list = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        rateCategory: customers.rateCategory,
        creditLimit: customers.creditLimit,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(eq(customers.businessId, user.businessId))
      .orderBy(asc(customers.name));

    const [agg] = await tx
      .select({
        totalOutstanding: sum(customers.outstandingBalance),
      })
      .from(customers)
      .where(eq(customers.businessId, user.businessId));

    return [list, agg] as const;
  });

  const totalOutstanding = totals?.totalOutstanding ?? '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Button asChild>
          <Link href="/customers/new">New customer</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total outstanding</CardTitle>
          <CardDescription>Sum of unpaid balances across all customers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">₹{Number(totalOutstanding).toFixed(2)}</p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No customers yet</CardTitle>
            <CardDescription>Add customers to track credit limits and outstanding balances.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/customers/new">Create customer</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead className="text-right">Credit limit</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{c.rateCategory}</TableCell>
                    <TableCell className="text-right">₹{Number(c.creditLimit).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          Number(c.outstandingBalance) > 0 ? 'font-medium text-destructive' : ''
                        }
                      >
                        ₹{Number(c.outstandingBalance).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/customers/${c.id}/edit`}>Edit</Link>
                        </Button>
                        <DeleteCustomerButton id={c.id} name={c.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
