import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { salesReturns } from '@mybizone/db';
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

export default async function ReturnsPage() {
  const user = await requireUser();

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: salesReturns.id,
        returnNo: salesReturns.returnNo,
        customerName: salesReturns.customerName,
        total: salesReturns.total,
        reason: salesReturns.reason,
        status: salesReturns.status,
        createdAt: salesReturns.createdAt,
      })
      .from(salesReturns)
      .where(eq(salesReturns.businessId, user.businessId))
      .orderBy(desc(salesReturns.createdAt))
      .limit(100);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales Returns</h1>
        <Button asChild>
          <Link href="/returns/new">New Return</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
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
                    No returns recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.customerName ?? '—'}
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
