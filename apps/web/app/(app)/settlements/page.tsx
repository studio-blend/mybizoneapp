import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import {
  customers,
  purchaseSettlements,
  salesSettlements,
  suppliers,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent } from '@mybizone/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { PurchaseSettlementForm } from './_components/purchase-settlement-form';
import { SalesSettlementForm } from './_components/sales-settlement-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { tab?: string };
}

function formatDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMethod(m: string) {
  const labels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    cheque: 'Cheque',
    other: 'Other',
  };
  return labels[m] ?? m;
}

export default async function SettlementsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const tab = searchParams.tab === 'purchases' ? 'purchases' : 'sales';

  const [customerList, supplierList, salesRows, purchaseRows] = await withTenant(
    db,
    user.businessId,
    async (tx) => {
      const cList = await tx
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          outstandingBalance: customers.outstandingBalance,
        })
        .from(customers)
        .where(eq(customers.businessId, user.businessId));

      const sList = await tx
        .select({
          id: suppliers.id,
          name: suppliers.name,
          phone: suppliers.phone,
          outstandingBalance: suppliers.outstandingBalance,
        })
        .from(suppliers)
        .where(eq(suppliers.businessId, user.businessId));

      const sRows = await tx
        .select({
          id: salesSettlements.id,
          amount: salesSettlements.amount,
          paymentMethod: salesSettlements.paymentMethod,
          referenceNo: salesSettlements.referenceNo,
          settledAt: salesSettlements.settledAt,
          customerName: customers.name,
          customerPhone: customers.phone,
        })
        .from(salesSettlements)
        .leftJoin(customers, eq(customers.id, salesSettlements.customerId))
        .where(eq(salesSettlements.businessId, user.businessId))
        .orderBy(desc(salesSettlements.settledAt))
        .limit(50);

      const pRows = await tx
        .select({
          id: purchaseSettlements.id,
          amount: purchaseSettlements.amount,
          paymentMethod: purchaseSettlements.paymentMethod,
          referenceNo: purchaseSettlements.referenceNo,
          settledAt: purchaseSettlements.settledAt,
          supplierName: suppliers.name,
          supplierPhone: suppliers.phone,
        })
        .from(purchaseSettlements)
        .leftJoin(suppliers, eq(suppliers.id, purchaseSettlements.supplierId))
        .where(eq(purchaseSettlements.businessId, user.businessId))
        .orderBy(desc(purchaseSettlements.settledAt))
        .limit(50);

      return [cList, sList, sRows, pRows] as const;
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settlements</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <Link
          href="/settlements?tab=sales"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'sales'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sales settlements
        </Link>
        <Link
          href="/settlements?tab=purchases"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'purchases'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Purchase settlements
        </Link>
      </div>

      {tab === 'sales' ? (
        <div className="space-y-6">
          {/* Sales settlement form */}
          <SalesSettlementForm customers={customerList} />

          {/* Recent sales settlements table */}
          {salesRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales settlements recorded yet.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(r.settledAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.customerName ?? '—'}
                          {r.customerPhone && (
                            <span className="block text-xs text-muted-foreground">
                              {r.customerPhone}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{Number(r.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>{formatMethod(r.paymentMethod)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.referenceNo ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Purchase settlement form */}
          <PurchaseSettlementForm suppliers={supplierList} />

          {/* Recent purchase settlements table */}
          {purchaseRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase settlements recorded yet.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(r.settledAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.supplierName ?? '—'}
                          {r.supplierPhone && (
                            <span className="block text-xs text-muted-foreground">
                              {r.supplierPhone}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{Number(r.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>{formatMethod(r.paymentMethod)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.referenceNo ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
