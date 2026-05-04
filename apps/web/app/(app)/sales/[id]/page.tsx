import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { businesses, invoices, saleItems, sales, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { GenerateInvoiceButton } from './_components/generate-invoice-button';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [row] = await tx
      .select({
        id: sales.id,
        billNo: sales.billNo,
        createdAt: sales.createdAt,
        customerName: sales.customerName,
        customerPhone: sales.customerPhone,
        customerGstin: sales.customerGstin,
        subtotal: sales.subtotal,
        discount: sales.discount,
        taxTotal: sales.taxTotal,
        total: sales.total,
        paymentMethod: sales.paymentMethod,
        notes: sales.notes,
        storeName: stores.name,
      })
      .from(sales)
      .leftJoin(stores, eq(stores.id, sales.storeId))
      .where(and(eq(sales.id, params.id), eq(sales.businessId, user.businessId)));
    if (!row) return null;
    const items = await tx
      .select({
        id: saleItems.id,
        productName: saleItems.productName,
        qty: saleItems.qty,
        unitSymbol: saleItems.unitSymbol,
        unitPrice: saleItems.unitPrice,
        gstRate: saleItems.gstRate,
        gstAmount: saleItems.gstAmount,
        lineTotal: saleItems.lineTotal,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, params.id))
      .orderBy(asc(saleItems.createdAt));
    const [biz] = await tx
      .select({ gstEnabled: businesses.gstEnabled })
      .from(businesses)
      .where(eq(businesses.id, user.businessId));
    const [inv] = await tx
      .select({ id: invoices.id, invoiceNo: invoices.invoiceNo, pdfKey: invoices.pdfKey })
      .from(invoices)
      .where(eq(invoices.saleId, params.id));
    return { row, items, gstEnabled: biz?.gstEnabled ?? false, invoice: inv ?? null };
  });

  if (!data) notFound();
  const { row, items, gstEnabled, invoice } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Bill {row.billNo}</CardTitle>
            {gstEnabled && (
              <GenerateInvoiceButton saleId={row.id} existingPdfKey={invoice?.pdfKey ?? null} />
            )}
          </div>
          {invoice && <p className="text-xs text-muted-foreground">Invoice: {invoice.invoiceNo}</p>}
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <Field label="Date" value={new Date(row.createdAt).toLocaleString('en-IN')} />
          <Field label="Store" value={row.storeName ?? '—'} />
          <Field label="Payment" value={row.paymentMethod} />
          <Field label="Customer" value={row.customerName ?? '—'} />
          <Field label="Phone" value={row.customerPhone ?? '—'} />
          <Field label="Customer GSTIN" value={row.customerGstin ?? '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.productName}</TableCell>
                  <TableCell className="text-right">
                    {i.qty} {i.unitSymbol}
                  </TableCell>
                  <TableCell className="text-right">{i.unitPrice}</TableCell>
                  <TableCell className="text-right">
                    {i.gstRate ? `${i.gstAmount} (${i.gstRate}%)` : '—'}
                  </TableCell>
                  <TableCell className="text-right">{i.lineTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <Row label="Subtotal" value={row.subtotal} />
          <Row label="Discount" value={`- ${row.discount}`} />
          <Row label="Tax" value={row.taxTotal} />
          <div className="border-t pt-2 text-base font-semibold">
            <Row label="Total" value={`₹ ${row.total}`} />
          </div>
          {row.notes && <p className="text-muted-foreground">Notes: {row.notes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
