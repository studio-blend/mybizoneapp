import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, emiPayments, emiSchedules, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RecordPaymentForm } from './_components/record-payment-form';

export const dynamic = 'force-dynamic';

export default async function EmiDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [schedule] = await tx
      .select({
        id: emiSchedules.id,
        saleId: emiSchedules.saleId,
        customerId: emiSchedules.customerId,
        customerName: customers.name,
        financeCompany: emiSchedules.financeCompany,
        principalAmount: emiSchedules.principalAmount,
        downPayment: emiSchedules.downPayment,
        tenureMonths: emiSchedules.tenureMonths,
        emiAmount: emiSchedules.emiAmount,
        interestRate: emiSchedules.interestRate,
        startDate: emiSchedules.startDate,
        status: emiSchedules.status,
        billNo: sales.billNo,
      })
      .from(emiSchedules)
      .leftJoin(customers, eq(customers.id, emiSchedules.customerId))
      .leftJoin(sales, eq(sales.id, emiSchedules.saleId))
      .where(
        and(eq(emiSchedules.id, params.id), eq(emiSchedules.businessId, user.businessId)),
      );
    if (!schedule) return null;

    const payments = await tx
      .select({
        id: emiPayments.id,
        instalmentNumber: emiPayments.instalmentNumber,
        dueDate: emiPayments.dueDate,
        paidDate: emiPayments.paidDate,
        amountPaid: emiPayments.amountPaid,
        paymentMethod: emiPayments.paymentMethod,
        status: emiPayments.status,
        notes: emiPayments.notes,
      })
      .from(emiPayments)
      .where(
        and(
          eq(emiPayments.emiScheduleId, schedule.id),
          eq(emiPayments.businessId, user.businessId),
        ),
      )
      .orderBy(asc(emiPayments.instalmentNumber));

    return { schedule, payments };
  });

  if (!data) notFound();
  const { schedule, payments } = data;

  const today = new Date().toISOString().slice(0, 10);
  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const totalPaid = payments
    .filter((p) => p.status === 'paid' && p.amountPaid)
    .reduce((s, p) => s + Number(p.amountPaid ?? 0), 0);
  const remaining = Math.max(Number(schedule.principalAmount) - totalPaid, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">EMI schedule</h1>
          <p className="text-sm text-muted-foreground">
            {schedule.financeCompany} ·{' '}
            {schedule.customerName ? (
              <span>{schedule.customerName}</span>
            ) : (
              <span>(no customer)</span>
            )}
            {schedule.billNo && (
              <>
                {' '}
                ·{' '}
                <Link href={`/sales/${schedule.saleId}`} className="underline">
                  {schedule.billNo}
                </Link>
              </>
            )}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
            schedule.status === 'active'
              ? 'bg-green-100 text-green-800'
              : schedule.status === 'completed'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {schedule.status}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Principal" value={`₹${Number(schedule.principalAmount).toFixed(2)}`} />
        <SummaryCard label="EMI / month" value={`₹${Number(schedule.emiAmount).toFixed(2)}`} />
        <SummaryCard
          label="Paid so far"
          value={`${paidCount}/${schedule.tenureMonths} (₹${totalPaid.toFixed(2)})`}
        />
        <SummaryCard label="Remaining" value={`₹${remaining.toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instalments</CardTitle>
          <CardDescription>
            {schedule.tenureMonths} instalments of ₹{Number(schedule.emiAmount).toFixed(2)}
            {Number(schedule.downPayment) > 0
              ? ` · down payment ₹${Number(schedule.downPayment).toFixed(2)}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid on</TableHead>
                <TableHead className="text-right">Amount ₹</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-72">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const isOverdue = p.status === 'pending' && p.dueDate < today;
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.instalmentNumber}</TableCell>
                    <TableCell>{p.dueDate}</TableCell>
                    <TableCell className="text-muted-foreground">{p.paidDate ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {p.amountPaid ? `₹${Number(p.amountPaid).toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {p.paymentMethod ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium capitalize ${
                          p.status === 'paid'
                            ? 'text-green-700'
                            : isOverdue
                              ? 'text-red-700'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {p.status === 'paid' ? 'paid' : isOverdue ? 'overdue' : 'pending'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.status === 'pending' && (
                        <RecordPaymentForm
                          paymentId={p.id}
                          scheduleId={schedule.id}
                          defaultAmount={Number(schedule.emiAmount).toFixed(2)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
