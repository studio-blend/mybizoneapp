import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { damageLogs } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, gte, lte, sum } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

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

const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  theft: 'Theft',
  spillage: 'Spillage',
  expired: 'Expired',
  other: 'Other',
};

export default async function DamageLogsPage() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const { rows, monthlyLoss } = await withTenant(db, user.businessId, async (tx) => {
    const rows = await tx
      .select({
        id: damageLogs.id,
        productName: damageLogs.productName,
        qty: damageLogs.qty,
        unitSymbol: damageLogs.unitSymbol,
        reason: damageLogs.reason,
        totalValue: damageLogs.totalValue,
        notes: damageLogs.notes,
        loggedAt: damageLogs.loggedAt,
      })
      .from(damageLogs)
      .where(eq(damageLogs.businessId, user.businessId))
      .orderBy(desc(damageLogs.loggedAt))
      .limit(100);

    const [lossRow] = await tx
      .select({ total: sum(damageLogs.totalValue) })
      .from(damageLogs)
      .where(
        and(
          eq(damageLogs.businessId, user.businessId),
          gte(damageLogs.loggedAt, monthStart),
          lte(damageLogs.loggedAt, monthEnd),
        ),
      );

    return { rows, monthlyLoss: lossRow?.total ?? '0' };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Damage Logs</h1>
        <Button asChild>
          <Link href="/damage-logs/new">Log damage</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total loss this month: ₹{Number(monthlyLoss).toFixed(2)}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Loss Value (₹)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No damage logs yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.loggedAt)}</TableCell>
                    <TableCell className="font-medium">{r.productName}</TableCell>
                    <TableCell className="text-right">
                      {r.qty} {r.unitSymbol}
                    </TableCell>
                    <TableCell>{REASON_LABELS[r.reason] ?? r.reason}</TableCell>
                    <TableCell className="text-right">
                      {r.totalValue != null ? Number(r.totalValue).toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.notes ?? '—'}</TableCell>
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
