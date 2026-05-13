import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { openingBalances, purchases, suppliers } from '@mybizone/db';
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
import { SupplierOpeningBalanceForm } from '../_components/opening-balance-form';

export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, params.id), eq(suppliers.businessId, user.businessId)));
    if (!supplier) return null;

    const fy = financialYear(new Date());
    const [opening] = await tx
      .select()
      .from(openingBalances)
      .where(
        and(
          eq(openingBalances.businessId, user.businessId),
          eq(openingBalances.entityType, 'supplier'),
          eq(openingBalances.entityId, supplier.id),
          eq(openingBalances.financialYear, fy),
        ),
      );

    const recentPurchases = await tx
      .select({
        id: purchases.id,
        billNo: purchases.billNo,
        purchaseDate: purchases.purchaseDate,
        total: purchases.total,
        paymentMethod: purchases.paymentMethod,
      })
      .from(purchases)
      .where(and(eq(purchases.supplierId, supplier.id), eq(purchases.businessId, user.businessId)))
      .orderBy(desc(purchases.purchaseDate))
      .limit(20);

    return { supplier, opening, fy, recentPurchases };
  });

  if (!data) notFound();
  const { supplier, opening, fy, recentPurchases } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {supplier.phone ?? 'No phone'} · {supplier.email ?? 'No email'}
            {supplier.gstin ? ` · GSTIN: ${supplier.gstin}` : ''}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/suppliers/${supplier.id}/edit`}>Edit</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xl font-semibold ${
                Number(supplier.outstandingBalance) > 0 ? 'text-destructive' : ''
              }`}
            >
              ₹{Number(supplier.outstandingBalance).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Address</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{supplier.address ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opening balance — FY {fy}</CardTitle>
          <CardDescription>
            Carried-forward dues from before MyBizOne started tracking this supplier. Counted in
            outstanding reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierOpeningBalanceForm
            supplierId={supplier.id}
            financialYear={fy}
            current={opening?.amount ?? '0'}
            notes={opening?.notes ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent purchases</CardTitle>
          <CardDescription>Last 20 purchase bills from this supplier.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total ₹</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPurchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No purchases recorded.
                  </TableCell>
                </TableRow>
              ) : (
                recentPurchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.billNo}</TableCell>
                    <TableCell>
                      {new Date(p.purchaseDate).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right">₹{Number(p.total).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.paymentMethod}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/purchases/${p.id}`}>View</Link>
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
