import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Bucket = 'all' | '0-30' | '31-60' | '61-90' | '90+';

interface PageProps {
  searchParams: { bucket?: string };
}

export default async function DueBillsReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const bucket: Bucket = isBucket(searchParams.bucket) ? searchParams.bucket : 'all';

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
        total: sales.total,
        dueDate: sales.dueDate,
        paymentStatus: sales.paymentStatus,
        paymentMethod: sales.paymentMethod,
        billType: sales.billType,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, user.businessId),
          inArray(sales.paymentStatus, ['due', 'partial', 'overdue']),
        ),
      )
      .orderBy(desc(sales.createdAt));
  });

  const today = new Date();
  // Decorate with days-overdue + bucket, then filter.
  const decorated = rows.map((r) => {
    const reference = r.dueDate ? new Date(r.dueDate) : new Date(r.createdAt);
    const days = Math.max(
      0,
      Math.floor((today.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const isOverdue = r.dueDate ? new Date(r.dueDate) < today : false;
    return { ...r, daysOverdue: days, isOverdue, bucket: bucketOf(days) };
  });

  const filtered = bucket === 'all' ? decorated : decorated.filter((r) => r.bucket === bucket);

  const totalOutstanding = decorated.reduce((s, r) => s + Number(r.total), 0);
  const bucketTotals = {
    '0-30': sum(decorated.filter((r) => r.bucket === '0-30')),
    '31-60': sum(decorated.filter((r) => r.bucket === '31-60')),
    '61-90': sum(decorated.filter((r) => r.bucket === '61-90')),
    '90+': sum(decorated.filter((r) => r.bucket === '90+')),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Due bills</h1>
        <p className="text-sm text-muted-foreground">
          Unsettled bills (credit, partial, finance/EMI). Click a row to open the bill.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <BucketCard label="Total outstanding" value={`₹${totalOutstanding.toFixed(2)}`} active={bucket === 'all'} href="/reports/due-bills" />
        <BucketCard
          label="0–30 days"
          value={`₹${bucketTotals['0-30'].toFixed(2)}`}
          active={bucket === '0-30'}
          href="/reports/due-bills?bucket=0-30"
        />
        <BucketCard
          label="31–60 days"
          value={`₹${bucketTotals['31-60'].toFixed(2)}`}
          active={bucket === '31-60'}
          href="/reports/due-bills?bucket=31-60"
        />
        <BucketCard
          label="61–90 days"
          value={`₹${bucketTotals['61-90'].toFixed(2)}`}
          active={bucket === '61-90'}
          href="/reports/due-bills?bucket=61-90"
        />
        <BucketCard
          label="90+ days"
          value={`₹${bucketTotals['90+'].toFixed(2)}`}
          active={bucket === '90+'}
          href="/reports/due-bills?bucket=90+"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {bucket === 'all' ? 'All due bills' : `Aging: ${bucket} days`}
          </CardTitle>
          <CardDescription>
            {filtered.length === 0
              ? 'No bills in this bucket.'
              : `${filtered.length} bill${filtered.length === 1 ? '' : 's'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total ₹</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    Nothing due in this bucket.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.billNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell>{r.customerName ?? '—'}</TableCell>
                    <TableCell className="text-right">₹{Number(r.total).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.dueDate ?? '—'}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium capitalize ${
                          r.paymentStatus === 'overdue' || r.isOverdue
                            ? 'text-red-700'
                            : r.paymentStatus === 'partial'
                              ? 'text-amber-700'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {r.isOverdue && r.paymentStatus !== 'overdue' ? 'overdue' : r.paymentStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{r.daysOverdue}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sales/${r.id}`}>View</Link>
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

function BucketCard({
  label,
  value,
  active,
  href,
}: {
  label: string;
  value: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className={active ? 'border-primary' : ''}>
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function bucketOf(days: number): '0-30' | '31-60' | '61-90' | '90+' {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function isBucket(v: string | undefined): v is Bucket {
  return v === 'all' || v === '0-30' || v === '31-60' || v === '61-90' || v === '90+';
}

function sum(rows: { total: string }[]): number {
  return rows.reduce((s, r) => s + Number(r.total), 0);
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
