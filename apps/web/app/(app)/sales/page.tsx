import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { storeId?: string; from?: string; to?: string };
}

export default async function SalesPage({ searchParams }: PageProps) {
  const user = await requireUser();

  const filterStoreId =
    searchParams.storeId && searchParams.storeId.length === 36 ? searchParams.storeId : null;
  const fromDate = parseDate(searchParams.from);
  const toDate = parseDate(searchParams.to);

  const data = await withTenant(db, user.businessId, async (tx) => {
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    const conditions = [eq(sales.businessId, user.businessId)];
    if (filterStoreId) conditions.push(eq(sales.storeId, filterStoreId));
    if (fromDate) conditions.push(gte(sales.createdAt, fromDate));
    if (toDate) conditions.push(lte(sales.createdAt, toDate));
    const rows = await tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
        total: sales.total,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
        storeName: stores.name,
      })
      .from(sales)
      .leftJoin(stores, eq(stores.id, sales.storeId))
      .where(and(...conditions))
      .orderBy(desc(sales.createdAt))
      .limit(100);
    return { stores: sts, rows };
  });

  const exportQs = new URLSearchParams();
  if (filterStoreId) exportQs.set('storeId', filterStoreId);
  if (searchParams.from) exportQs.set('from', searchParams.from);
  if (searchParams.to) exportQs.set('to', searchParams.to);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sales</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/api/sales/export?${exportQs.toString()}`}>Export CSV</Link>
          </Button>
          <Button asChild>
            <Link href="/sales/new">New sale</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>Showing the most recent 100 sales matching the filters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="storeId">Store</Label>
              <Select id="storeId" name="storeId" defaultValue={filterStoreId ?? ''}>
                <option value="">All stores</option>
                {data.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={searchParams.from ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={searchParams.to ?? ''} />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Apply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No sales match the filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.billNo}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.storeName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.customerName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.paymentMethod}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
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

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
