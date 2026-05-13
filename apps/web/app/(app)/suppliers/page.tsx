import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc, sum } from 'drizzle-orm';
import Link from 'next/link';
import { DeleteSupplierButton } from './_components/delete-button';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const user = await requireUser();

  const { rows, totalOutstanding } = await withTenant(db, user.businessId, async (tx) => {
    const rows = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        phone: suppliers.phone,
        gstin: suppliers.gstin,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .orderBy(asc(suppliers.name));

    const [agg] = await tx
      .select({ total: sum(suppliers.outstandingBalance) })
      .from(suppliers);

    return { rows, totalOutstanding: agg?.total ?? '0' };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Suppliers</h1>
        <Button asChild>
          <Link href="/suppliers/new">New supplier</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total outstanding</CardTitle>
          <CardDescription>Amount owed to all suppliers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">₹{Number(totalOutstanding).toFixed(2)}</p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No suppliers yet</CardTitle>
            <CardDescription>
              Add your first supplier to start tracking purchase bills and outstanding balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/suppliers/new">Add supplier</Link>
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
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Outstanding balance</TableHead>
                  <TableHead className="w-36 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {s.gstin ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{Number(s.outstandingBalance).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/suppliers/${s.id}/edit`}>Edit</Link>
                        </Button>
                        <DeleteSupplierButton id={s.id} name={s.name} />
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
