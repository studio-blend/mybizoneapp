import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { customers, emiSchedules } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function EmiListPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        id: emiSchedules.id,
        financeCompany: emiSchedules.financeCompany,
        principalAmount: emiSchedules.principalAmount,
        emiAmount: emiSchedules.emiAmount,
        tenureMonths: emiSchedules.tenureMonths,
        startDate: emiSchedules.startDate,
        status: emiSchedules.status,
        customerName: customers.name,
      })
      .from(emiSchedules)
      .leftJoin(customers, eq(customers.id, emiSchedules.customerId))
      .where(eq(emiSchedules.businessId, user.businessId))
      .orderBy(desc(emiSchedules.createdAt));
  });

  const active = rows.filter((r) => r.status === 'active');
  const completed = rows.filter((r) => r.status !== 'active');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">EMI schedules</h1>
        <p className="text-sm text-muted-foreground">
          Instalment plans tied to finance/EMI sales. Record payments as instalments come in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active schedules</CardTitle>
          <CardDescription>
            {active.length === 0 ? 'No active EMI schedules yet.' : `${active.length} running.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Finance Co.</TableHead>
                <TableHead className="text-right">Principal ₹</TableHead>
                <TableHead className="text-right">EMI/mo ₹</TableHead>
                <TableHead className="text-right">Tenure</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No active schedules.
                  </TableCell>
                </TableRow>
              ) : (
                active.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.customerName ?? '—'}</TableCell>
                    <TableCell>{r.financeCompany}</TableCell>
                    <TableCell className="text-right">₹{Number(r.principalAmount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">₹{Number(r.emiAmount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.tenureMonths} mo</TableCell>
                    <TableCell className="text-muted-foreground">{r.startDate}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/emi/${r.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Closed / defaulted</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Finance Co.</TableHead>
                  <TableHead className="text-right">Principal ₹</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.customerName ?? '—'}</TableCell>
                    <TableCell>{r.financeCompany}</TableCell>
                    <TableCell className="text-right">₹{Number(r.principalAmount).toFixed(2)}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{r.status}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/emi/${r.id}`}>View</Link>
                      </Button>
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
