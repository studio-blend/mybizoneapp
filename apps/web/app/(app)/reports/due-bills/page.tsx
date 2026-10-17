import { activeAllocation } from '@/lib/accounting-evidence';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { indiaToday } from '@/lib/stock-batch-policy';
import { sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Bucket = 'all' | '0-30' | '31-60' | '61-90' | '90+';

interface PageProps {
  searchParams: Promise<{ bucket?: string }>;
}

export default async function DueBillsReportPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  await requirePermission(user, 'view_reports');
  const bucket: Bucket = isBucket(searchParams.bucket) ? searchParams.bucket : 'all';

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
        total: sql<string>`CASE WHEN "sales".payment_method='order' THEN GREATEST(0,"sales".total
         -COALESCE((SELECT sum(r.total) FROM sales_returns r WHERE r.business_id="sales".business_id AND r.original_sale_id="sales".id AND r.status='completed'),0)
         -COALESCE((SELECT sum(a.amount) FROM customer_order_allocations a JOIN customer_order_deliveries d ON d.id=a.delivery_id AND d.business_id=a.business_id WHERE d.sale_id="sales".id AND d.business_id="sales".business_id),0))
         WHEN "sales".payment_method='credit' THEN GREATEST(0,"sales".total
         -COALESCE((SELECT sum(r.total-COALESCE(r.refund_due_amount,0)) FROM sales_returns r WHERE r.business_id="sales".business_id AND r.original_sale_id="sales".id AND r.status='completed'),0)
         -COALESCE((SELECT sum(a.amount) FROM sales_settlement_allocations a WHERE a.business_id="sales".business_id AND a.sale_id="sales".id AND ${activeAllocation('sales')}),0)) ELSE "sales".total END::text`,
        orderId: sql<
          string | null
        >`(SELECT d.order_id FROM customer_order_deliveries d WHERE d.sale_id="sales".id AND d.business_id="sales".business_id)`,
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
          eq(sales.status, 'completed'),
          sql`${sales.billType}<>'estimate'`,
        ),
      )
      .orderBy(desc(sales.createdAt));
  });

  const todayDay = indiaToday();
  const today = new Date(`${todayDay}T00:00:00Z`);
  // Decorate with days-overdue + bucket, then filter.
  const decorated = rows
    .filter((r) => Number(r.total) > 0)
    .map((r) => {
      const reference = new Date(`${r.dueDate ?? indiaToday(r.createdAt)}T00:00:00Z`);
      const days = Math.max(
        0,
        Math.floor((today.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const isOverdue = r.dueDate ? r.dueDate < todayDay : false;
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
          Credit and order bills show values remaining after linked returns and bill allocations.
          Unallocated general payments may still reduce customer debt; assign them in Settlements
          before treating these groups as invoice ageing. EMI values remain original bill values;
          use the EMI schedule for principal and interest still due.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        <BucketCard
          label="Unsettled bill values"
          value={`₹${totalOutstanding.toFixed(2)}`}
          active={bucket === 'all'}
          href="/reports/due-bills"
        />
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
          <CardTitle>{bucket === 'all' ? 'All due bills' : `Aging: ${bucket} days`}</CardTitle>
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
                        <Link href={r.orderId ? `/orders/${r.orderId}` : `/sales/${r.id}`}>
                          View
                        </Link>
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
