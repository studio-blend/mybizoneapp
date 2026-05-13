import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { deliveryChallans } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { DcStatusActions } from './_components/dc-status-actions';

export const dynamic = 'force-dynamic';

type DcStatus = 'draft' | 'dispatched' | 'delivered' | 'cancelled' | 'converted';

const STATUS_BADGE: Record<DcStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  dispatched: { label: 'Dispatched', className: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  converted: { label: 'Converted', className: 'bg-purple-100 text-purple-700' },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status as DcStatus] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };
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

export default async function DeliveryChallansPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: deliveryChallans.id,
        dcNo: deliveryChallans.dcNo,
        createdAt: deliveryChallans.createdAt,
        customerName: deliveryChallans.customerName,
        total: deliveryChallans.total,
        status: deliveryChallans.status,
        dispatchedAt: deliveryChallans.dispatchedAt,
      })
      .from(deliveryChallans)
      .where(eq(deliveryChallans.businessId, user.businessId))
      .orderBy(desc(deliveryChallans.createdAt))
      .limit(100),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Delivery Challans</h1>
        <Button asChild>
          <Link href="/delivery-challans/new">New challan</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DC #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dispatched</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No delivery challans yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.dcNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerName ?? '—'}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.dispatchedAt ? formatDate(r.dispatchedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <DcStatusActions id={r.id} currentStatus={r.status} />
                      </div>
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
