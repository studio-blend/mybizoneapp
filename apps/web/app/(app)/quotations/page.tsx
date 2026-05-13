import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { quotations } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { StatusActions } from './_components/status-actions';

export const dynamic = 'force-dynamic';

type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

const STATUS_BADGE: Record<
  QuotationStatus,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', className: 'bg-orange-100 text-orange-700' },
  converted: { label: 'Converted', className: 'bg-purple-100 text-purple-700' },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status as QuotationStatus] ?? {
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

export default async function QuotationsPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: quotations.id,
        quoteNo: quotations.quoteNo,
        createdAt: quotations.createdAt,
        customerName: quotations.customerName,
        total: quotations.total,
        status: quotations.status,
        validUntil: quotations.validUntil,
      })
      .from(quotations)
      .where(eq(quotations.businessId, user.businessId))
      .orderBy(desc(quotations.createdAt))
      .limit(100),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotations</h1>
        <Button asChild>
          <Link href="/quotations/new">New quotation</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No quotations yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.quoteNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerName ?? '—'}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.validUntil ? formatDate(r.validUntil) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <StatusActions id={r.id} currentStatus={r.status} />
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/quotations/${r.id}`}>View</Link>
                        </Button>
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
