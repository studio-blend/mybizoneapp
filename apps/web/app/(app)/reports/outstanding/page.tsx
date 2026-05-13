import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { tab?: string };
}

export default async function OutstandingPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const tab = searchParams.tab === 'suppliers' ? 'suppliers' : 'customers';

  const { customerRows, supplierRows } = await withTenant(db, user.businessId, async (tx) => {
    const customerRows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        creditLimit: customers.creditLimit,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(
        eq(customers.businessId, user.businessId),
      )
      .orderBy(desc(customers.outstandingBalance));

    const supplierRows = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        phone: suppliers.phone,
        gstin: suppliers.gstin,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(
        eq(suppliers.businessId, user.businessId),
      )
      .orderBy(desc(suppliers.outstandingBalance));

    return { customerRows, supplierRows };
  });

  // Filter to positive balances for display
  const dueCustomers = customerRows.filter((c) => Number(c.outstandingBalance) > 0);
  const dueSuppliers = supplierRows.filter((s) => Number(s.outstandingBalance) > 0);

  const customerTotal = dueCustomers.reduce(
    (acc, c) => acc + Number(c.outstandingBalance),
    0,
  );
  const supplierTotal = dueSuppliers.reduce(
    (acc, s) => acc + Number(s.outstandingBalance),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Outstanding Dues</h1>
          <p className="text-sm text-muted-foreground">
            Customers and suppliers with unpaid balances.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <Link
          href="/reports/outstanding?tab=customers"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'customers'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Customers
        </Link>
        <Link
          href="/reports/outstanding?tab=suppliers"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'suppliers'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Suppliers
        </Link>
      </div>

      {tab === 'customers' ? (
        <Card>
          <CardHeader>
            <CardTitle>Customer Dues</CardTitle>
            <CardDescription>
              {dueCustomers.length === 0
                ? 'No outstanding customer dues.'
                : `${dueCustomers.length} customer${dueCustomers.length === 1 ? '' : 's'} — Total outstanding: ₹${customerTotal.toFixed(2)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Credit Limit ₹</TableHead>
                  <TableHead className="text-right">Outstanding ₹</TableHead>
                  <TableHead className="text-right">Utilisation %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
                ) : (
                  dueCustomers.map((c) => {
                    const outstanding = Number(c.outstandingBalance);
                    const creditLimit = Number(c.creditLimit ?? 0);
                    const utilisation =
                      creditLimit > 0
                        ? ((outstanding / creditLimit) * 100).toFixed(1)
                        : null;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.phone ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {creditLimit > 0 ? creditLimit.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {outstanding.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {utilisation !== null ? `${utilisation}%` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Supplier Dues</CardTitle>
            <CardDescription>
              {dueSuppliers.length === 0
                ? 'No outstanding supplier dues.'
                : `${dueSuppliers.length} supplier${dueSuppliers.length === 1 ? '' : 's'} — Total owed: ₹${supplierTotal.toFixed(2)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Outstanding ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
                ) : (
                  dueSuppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.phone ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {s.gstin ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {Number(s.outstandingBalance).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
