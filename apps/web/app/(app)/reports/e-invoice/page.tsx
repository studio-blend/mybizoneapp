import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { eInvoices, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, eq, isNull, or } from 'drizzle-orm';
import Link from 'next/link';
import { EInvoiceActions } from './_components/e-invoice-actions';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  generated: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  failed: 'bg-gray-100 text-gray-800',
};

export default async function EInvoicePage() {
  const user = await requireUser();

  const rows = await withTenant(db, user.businessId, async (tx) => {
    // All GST bills with their e-invoice status (if any)
    const gstSales = await tx
      .select({
        saleId: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
        customerGstin: sales.customerGstin,
        total: sales.total,
        eInvoiceId: eInvoices.id,
        irn: eInvoices.irn,
        ackNo: eInvoices.ackNo,
        status: eInvoices.status,
      })
      .from(sales)
      .leftJoin(eInvoices, eq(eInvoices.saleId, sales.id))
      .where(
        and(
          eq(sales.businessId, user.businessId),
          eq(sales.status, 'completed'),
          eq(sales.billType, 'gst_bill'),
        ),
      )
      .orderBy(sales.createdAt);

    return gstSales;
  });

  // Deduplicate — take most recent e-invoice per sale
  const saleMap = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const existing = saleMap.get(row.saleId);
    if (!existing || (row.status === 'generated' && existing.status !== 'generated')) {
      saleMap.set(row.saleId, row);
    }
  }
  const displayRows = Array.from(saleMap.values());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">E-Invoice (IRN)</h1>
          <p className="text-sm text-muted-foreground">Generate and manage IRNs for GST bills</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GST Bills</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Amount ₹</TableHead>
                <TableHead>IRN Status</TableHead>
                <TableHead>IRN</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    No GST bills found.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row) => {
                  const status = row.status ?? 'pending';
                  return (
                    <TableRow key={row.saleId}>
                      <TableCell className="font-mono text-sm">{row.billNo}</TableCell>
                      <TableCell>{row.createdAt.toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>{row.customerName ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.customerGstin ?? '—'}</TableCell>
                      <TableCell className="text-right">₹{Number(row.total).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-800'}`}>
                          {status}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {row.irn ?? '—'}
                      </TableCell>
                      <TableCell>
                        <EInvoiceActions
                          saleId={row.saleId}
                          eInvoiceId={row.eInvoiceId ?? null}
                          status={status}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        IRN generation uses GSTN IRP Sandbox API. Set GSTN_SANDBOX=false and add credentials in .env to use production.
      </p>
    </div>
  );
}
