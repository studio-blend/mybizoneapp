import { ListPagination } from '@/components/list-pagination';
import { db } from '@/lib/db';
import { PAGE_SIZE, parsePage } from '@/lib/pagination';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { customerTags, customers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, eq, inArray, sum } from 'drizzle-orm';
import Link from 'next/link';
import { Suspense } from 'react';
import { DeleteCustomerButton } from './_components/delete-button';
import { TagFilter } from './_components/tag-filter';

export const dynamic = 'force-dynamic';

export default async function CustomersPage(props: {
  searchParams: Promise<{ tag?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  await requirePermission(user, 'manage_customers');
  const activeTag = searchParams.tag ?? null;
  const page = parsePage(searchParams.page);

  const [pageRows, totals] = await withTenant(db, user.businessId, async (tx) => {
    // Keep tag membership in SQL instead of transferring every matching ID.
    const tagCondition = activeTag
      ? inArray(
          customers.id,
          tx
            .select({ customerId: customerTags.customerId })
            .from(customerTags)
            .where(
              and(eq(customerTags.businessId, user.businessId), eq(customerTags.tag, activeTag)),
            ),
        )
      : undefined;

    const query = tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        rateCategory: customers.rateCategory,
        creditLimit: customers.creditLimit,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(and(eq(customers.businessId, user.businessId), tagCondition))
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);

    const list = await query;

    const [agg] = await tx
      .select({
        totalOutstanding: sum(customers.outstandingBalance),
      })
      .from(customers)
      .where(eq(customers.businessId, user.businessId));

    return [list, agg] as const;
  });

  const rows = pageRows.slice(0, PAGE_SIZE);
  const hasNext = pageRows.length > PAGE_SIZE;
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

      {/* Tag filter */}
      <Suspense>
        <TagFilter current={activeTag} />
      </Suspense>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {page > 1
                ? 'No more customers'
                : activeTag
                  ? `No customers tagged "${activeTag}"`
                  : 'No customers yet'}
            </CardTitle>
            <CardDescription>
              {page > 1
                ? 'Use Previous to return to your customers.'
                : activeTag
                  ? 'Try a different tag filter or clear the filter to see all customers.'
                  : 'Add customers to track credit limits and outstanding balances.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activeTag && page === 1 && (
              <Button asChild>
                <Link href="/customers/new">Create customer</Link>
              </Button>
            )}
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
                    <TableCell className="font-medium">
                      <Link
                        href={`/customers/${c.id}`}
                        prefetch={false}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {c.rateCategory}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{Number(c.creditLimit).toFixed(2)}
                    </TableCell>
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
                          <Link href={`/customers/${c.id}/edit`} prefetch={false}>
                            Edit
                          </Link>
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
      <ListPagination path="/customers" filters={searchParams} page={page} hasNext={hasNext} />
    </div>
  );
}
