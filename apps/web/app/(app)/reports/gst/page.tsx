import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { from?: string; to?: string };
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function GstReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const fromStr = searchParams.from ?? firstOfMonth();
  const toStr = searchParams.to ?? todayStr();

  const fromDate = new Date(`${fromStr}T00:00:00`);
  const toDate = new Date(`${toStr}T23:59:59`);

  const rows = await withTenant(db, user.businessId, async (tx) => {
    return tx
      .select({
        hsnCode: saleItems.hsnCode,
        gstRate: saleItems.gstRate,
        totalQty: sql<string>`sum(${saleItems.qty})`.as('total_qty'),
        taxableAmount:
          sql<string>`sum(${saleItems.lineTotal} - ${saleItems.gstAmount})`.as('taxable_amount'),
        totalGst: sql<string>`sum(${saleItems.gstAmount})`.as('total_gst'),
        totalAmount: sql<string>`sum(${saleItems.lineTotal})`.as('total_amount'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(saleItems.businessId, user.businessId),
          eq(sales.status, 'completed'),
          gte(sales.createdAt, fromDate),
          lte(sales.createdAt, toDate),
        ),
      )
      .groupBy(saleItems.hsnCode, saleItems.gstRate)
      .orderBy(saleItems.hsnCode, saleItems.gstRate);
  });

  // Compute totals row
  const totals = rows.reduce(
    (acc, r) => ({
      totalQty: acc.totalQty + Number(r.totalQty ?? 0),
      taxableAmount: acc.taxableAmount + Number(r.taxableAmount ?? 0),
      totalGst: acc.totalGst + Number(r.totalGst ?? 0),
      totalAmount: acc.totalAmount + Number(r.totalAmount ?? 0),
    }),
    { totalQty: 0, taxableAmount: 0, totalGst: 0, totalAmount: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">HSN-wise GST Report</h1>
          <p className="text-sm text-muted-foreground">
            {fromStr} to {toStr}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date range filter */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toStr}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>HSN-wise breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HSN Code</TableHead>
                <TableHead className="text-right">GST Rate %</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Taxable Amt ₹</TableHead>
                <TableHead className="text-right">CGST ₹</TableHead>
                <TableHead className="text-right">SGST ₹</TableHead>
                <TableHead className="text-right">Total GST ₹</TableHead>
                <TableHead className="text-right">Total Amt ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    No sales in the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row, i) => {
                    const gst = Number(row.totalGst ?? 0);
                    const half = gst / 2;
                    return (
                      <TableRow key={`${row.hsnCode ?? ''}-${row.gstRate ?? ''}-${i}`}>
                        <TableCell>{row.hsnCode ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {row.gstRate != null ? Number(row.gstRate).toFixed(1) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.totalQty ?? 0).toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(row.taxableAmount ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{half.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{half.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{gst.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {Number(row.totalAmount ?? 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{totals.taxableAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {(totals.totalGst / 2).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(totals.totalGst / 2).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{totals.totalGst.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
