import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { purchases } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  cash: { label: 'Cash', className: 'bg-green-100 text-green-700' },
  upi: { label: 'UPI', className: 'bg-blue-100 text-blue-700' },
  card: { label: 'Card', className: 'bg-indigo-100 text-indigo-700' },
  credit: { label: 'Credit', className: 'bg-orange-100 text-orange-700' },
  other: { label: 'Other', className: 'bg-gray-100 text-gray-700' },
};

function PaymentBadge({ method }: { method: string }) {
  const badge = PAYMENT_BADGE[method] ?? { label: method, className: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function PurchasesPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: purchases.id,
        billNo: purchases.billNo,
        purchaseDate: purchases.purchaseDate,
        supplierName: purchases.supplierName,
        total: purchases.total,
        paymentMethod: purchases.paymentMethod,
      })
      .from(purchases)
      .where(eq(purchases.businessId, user.businessId))
      .orderBy(desc(purchases.purchaseDate))
      .limit(100),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Purchase Bills</h1>
        <Button asChild>
          <Link href="/purchases/new">New purchase</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No purchase bills yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.billNo}</TableCell>
                    <TableCell>{formatDate(r.purchaseDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.supplierName || '—'}
                    </TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell>
                      <PaymentBadge method={r.paymentMethod} />
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
