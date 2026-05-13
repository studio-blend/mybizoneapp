import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { purchaseReturns } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PurchaseReturnsPage() {
  const user = await requireUser();

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: purchaseReturns.id,
        returnNo: purchaseReturns.returnNo,
        supplierName: purchaseReturns.supplierName,
        total: purchaseReturns.total,
        reason: purchaseReturns.reason,
        status: purchaseReturns.status,
        createdAt: purchaseReturns.createdAt,
      })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.businessId, user.businessId))
      .orderBy(desc(purchaseReturns.createdAt))
      .limit(100);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Purchase Returns</h1>
        <Button asChild>
          <Link href="/purchase-returns/new">New Return</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No purchase returns recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.supplierName || '—'}
                    </TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {r.reason ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.status === 'completed'
                            ? 'text-green-600 text-xs font-medium'
                            : 'text-destructive text-xs font-medium'
                        }
                      >
                        {r.status}
                      </span>
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

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
