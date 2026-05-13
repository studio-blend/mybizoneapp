import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, saleItems, sales } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq, gte, isNotNull, lte, ne, sql, sum } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Button } from '@mybizone/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { Gstr1DownloadButtons } from './_components/download-buttons';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { fy?: string; from?: string; to?: string };
}

function currentFy(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

function fyStartDate(fy: string): string {
  const [startYear] = fy.split('-');
  return `${startYear}-04-01`;
}

function fyEndDate(fy: string): string {
  const [startYear] = fy.split('-');
  return `${Number(startYear) + 1}-03-31`;
}

export default async function Gstr1Page({ searchParams }: PageProps) {
  const user = await requireUser();
  const fy = searchParams.fy ?? currentFy();
  const fromStr = searchParams.from ?? fyStartDate(fy);
  const toStr = searchParams.to ?? fyEndDate(fy);

  const fromDate = new Date(`${fromStr}T00:00:00`);
  const toDate = new Date(`${toStr}T23:59:59`);

  const { summary, hsnSummary, bizGstin } = await withTenant(db, user.businessId, async (tx) => {
    const bizRows = await tx
      .select({ gstin: businesses.gstin })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    const bizGstin = bizRows[0]?.gstin ?? '';

    // B2B summary
    const b2bCount = await tx
      .select({ count: sql<number>`count(*)::int`.as('count'), taxable: sql<string>`sum(${sales.subtotal}::numeric)`.as('taxable'), tax: sql<string>`sum(${sales.taxTotal}::numeric)`.as('tax') })
      .from(sales)
      .where(and(eq(sales.businessId, user.businessId), eq(sales.status, 'completed'), ne(sales.billType, 'estimate'), isNotNull(sales.customerGstin), gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)));

    // B2CS summary
    const b2csCount = await tx
      .select({ count: sql<number>`count(*)::int`.as('count'), taxable: sql<string>`sum(${sales.subtotal}::numeric)`.as('taxable'), tax: sql<string>`sum(${sales.taxTotal}::numeric)`.as('tax') })
      .from(sales)
      .where(and(eq(sales.businessId, user.businessId), eq(sales.status, 'completed'), ne(sales.billType, 'estimate'), sql`${sales.customerGstin} IS NULL`, gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)));

    // HSN summary
    const hsnSummary = await tx
      .select({
        hsnCode: saleItems.hsnCode,
        productName: sql<string>`max(${saleItems.productName})`.as('product_name'),
        unitSymbol: sql<string>`max(${saleItems.unitSymbol})`.as('unit_symbol'),
        totalQty: sum(saleItems.qty),
        totalValue: sum(saleItems.lineTotal),
        taxableValue: sql<string>`sum(${saleItems.lineTotal}::numeric - ${saleItems.gstAmount}::numeric)`.as('taxable_value'),
        cgst: sql<string>`sum(${saleItems.gstAmount}::numeric / 2)`.as('cgst'),
        sgst: sql<string>`sum(${saleItems.gstAmount}::numeric / 2)`.as('sgst'),
        igst: sql<string>`'0'`.as('igst'),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(saleItems.businessId, user.businessId), eq(sales.status, 'completed'), ne(sales.billType, 'estimate'), eq(saleItems.isFreeItem, false), gte(sales.createdAt, fromDate), lte(sales.createdAt, toDate)))
      .groupBy(saleItems.hsnCode)
      .orderBy(saleItems.hsnCode);

    return {
      summary: { b2b: b2bCount[0], b2cs: b2csCount[0] },
      hsnSummary,
      bizGstin,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GSTR-1</h1>
          <p className="text-sm text-muted-foreground">FY {fy} — {fromStr} to {toStr}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="fy" className="text-xs font-medium text-muted-foreground">Financial Year</label>
          <input id="fy" name="fy" defaultValue={fy} placeholder="2025-26" className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-muted-foreground">From</label>
          <input id="from" type="date" name="from" defaultValue={fromStr} className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-muted-foreground">To</label>
          <input id="to" type="date" name="to" defaultValue={toStr} className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">B2B (GST Buyer) Supplies</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.b2b?.count ?? 0} bills</p>
            <p className="text-sm text-muted-foreground">Taxable: ₹{Number(summary.b2b?.taxable ?? 0).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Tax: ₹{Number(summary.b2b?.tax ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">B2CS (Consumer) Supplies</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.b2cs?.count ?? 0} bills</p>
            <p className="text-sm text-muted-foreground">Taxable: ₹{Number(summary.b2cs?.taxable ?? 0).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Tax: ₹{Number(summary.b2cs?.tax ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* HSN Summary table */}
      <Card>
        <CardHeader><CardTitle>HSN Summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>HSN Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Value ₹</TableHead>
                <TableHead className="text-right">Taxable ₹</TableHead>
                <TableHead className="text-right">CGST ₹</TableHead>
                <TableHead className="text-right">SGST ₹</TableHead>
                <TableHead className="text-right">IGST ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hsnSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No data in selected period.</TableCell>
                </TableRow>
              ) : (
                hsnSummary.map((row, i) => (
                  <TableRow key={row.hsnCode ?? i}>
                    <TableCell>{row.hsnCode ?? '—'}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.unitSymbol}</TableCell>
                    <TableCell className="text-right">{Number(row.totalQty ?? 0).toFixed(3)}</TableCell>
                    <TableCell className="text-right">{Number(row.totalValue ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.taxableValue ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.cgst ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.sgst ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">0.00</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Download buttons (client component) */}
      <Gstr1DownloadButtons
        financialYear={fy}
        fromDate={fromStr}
        toDate={toStr}
        businessGstin={bizGstin}
      />
    </div>
  );
}
