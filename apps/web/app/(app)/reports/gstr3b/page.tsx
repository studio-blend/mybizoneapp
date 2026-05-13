import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import Link from 'next/link';
import { fetchGstr3bData } from './actions';
import { Gstr3bDownloadButton } from './_components/download-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { from?: string; to?: string };
}

function financialYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function Gstr3bPage({ searchParams }: PageProps) {
  const fromStr = searchParams.from ?? financialYearStart();
  const toStr = searchParams.to ?? todayStr();

  const data = await fetchGstr3bData({ fromDate: fromStr, toDate: toStr });

  if ('error' in data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">GSTR-3B Summary</h1>
        <p className="text-red-600">Error: {data.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GSTR-3B Summary</h1>
          <p className="text-sm text-muted-foreground">
            {data.businessName} {data.gstin ? `| GSTIN: ${data.gstin}` : ''} | {fromStr} to {toStr}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/reports">Back to Reports</Link>
        </Button>
      </div>

      {/* Date filter */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
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

      {/* 3.1 Outward Supplies */}
      <Card>
        <CardHeader>
          <CardTitle>3.1 Details of Outward Supplies and Inward Supplies Liable to Reverse Charge</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nature of Supplies</TableHead>
                <TableHead className="text-right">Taxable Value ₹</TableHead>
                <TableHead className="text-right">IGST ₹</TableHead>
                <TableHead className="text-right">CGST ₹</TableHead>
                <TableHead className="text-right">SGST/UTGST ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>(a) Taxable supplies (other than zero rated, nil and exempted)</TableCell>
                <TableCell className="text-right">{fmt(data.outwardTaxable.taxable)}</TableCell>
                <TableCell className="text-right">{fmt(data.outwardTaxable.igst)}</TableCell>
                <TableCell className="text-right">{fmt(data.outwardTaxable.cgst)}</TableCell>
                <TableCell className="text-right">{fmt(data.outwardTaxable.sgst)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(b) Zero rated supply (Export) on payment of tax</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(c) Other zero rated / exempt / non-GST supplies</TableCell>
                <TableCell className="text-right">{fmt(data.outwardExempt)}</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(e) Non-GST outward supplies</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4. ITC */}
      <Card>
        <CardHeader><CardTitle>4. Eligible ITC</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nature of ITC</TableHead>
                <TableHead className="text-right">IGST ₹</TableHead>
                <TableHead className="text-right">CGST ₹</TableHead>
                <TableHead className="text-right">SGST ₹</TableHead>
                <TableHead className="text-right">Cess ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>(A) Inward supplies from registered persons</TableCell>
                <TableCell className="text-right">{fmt(data.itcInward.igst)}</TableCell>
                <TableCell className="text-right">{fmt(data.itcInward.cgst)}</TableCell>
                <TableCell className="text-right">{fmt(data.itcInward.sgst)}</TableCell>
                <TableCell className="text-right">0.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(B) Import of goods</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
                <TableCell className="text-right">0.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Net summary */}
      <Card>
        <CardHeader><CardTitle>5. Net ITC and Tax Payable</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm">Net ITC Available (5)</span>
              <span className="text-sm tabular-nums font-medium">₹{fmt(data.netItc)}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm">Total Tax on Outward Supplies</span>
              <span className="text-sm tabular-nums">₹{fmt(data.outwardTaxable.cgst + data.outwardTaxable.sgst + data.outwardTaxable.igst)}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-base font-bold">5.1 Net Tax Payable</span>
              <span className={`text-xl font-bold tabular-nums ${data.netPayable <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{fmt(data.netPayable)}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Note: This is a management summary. Consult a CA for official GSTR-3B filing.
          </p>
        </CardContent>
      </Card>

      <Gstr3bDownloadButton fromDate={fromStr} toDate={toStr} />
    </div>
  );
}
