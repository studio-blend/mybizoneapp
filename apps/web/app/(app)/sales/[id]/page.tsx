import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import {
  customerOrderDeliveries,
  invoices,
  products,
  saleItems,
  sales,
  stockBatchMovements,
  stockBatches,
  stockSerialEvents,
  stockSerials,
  stores,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GenerateInvoiceButton } from './_components/generate-invoice-button';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [row] = await tx
      .select({
        id: sales.id,
        storeId: sales.storeId,
        billNo: sales.billNo,
        billType: sales.billType,
        gstEnabledAtSale: sales.gstEnabledAtSale,
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
    await requirePermission(user, 'view_sales', { storeId: row.storeId });
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
    const [inv] = await tx
      .select({ id: invoices.id, invoiceNo: invoices.invoiceNo, pdfKey: invoices.pdfKey })
      .from(invoices)
      .where(eq(invoices.saleId, params.id));
    const batches = await tx
      .select({
        id: stockBatchMovements.id,
        code: stockBatches.code,
        expiresOn: stockBatches.expiresOn,
        quantity: stockBatchMovements.quantity,
        name: products.name,
        unit: products.unitSymbol,
      })
      .from(stockBatchMovements)
      .innerJoin(stockBatches, eq(stockBatches.id, stockBatchMovements.batchId))
      .innerJoin(products, eq(products.id, stockBatches.productId))
      .where(
        and(
          eq(stockBatchMovements.businessId, user.businessId),
          eq(stockBatchMovements.kind, 'sale'),
          eq(stockBatchMovements.documentId, row.id),
        ),
      )
      .orderBy(asc(stockBatches.expiresOn), asc(stockBatches.code));
    const serials = await tx
      .select({
        id: stockSerialEvents.id,
        code: stockSerials.code,
        months: stockSerialEvents.warrantyMonths,
        endsOn: stockSerialEvents.warrantyEndsOn,
        issuer: stockSerialEvents.warrantyIssuer,
      })
      .from(stockSerialEvents)
      .innerJoin(stockSerials, eq(stockSerials.id, stockSerialEvents.serialId))
      .where(
        and(
          eq(stockSerialEvents.businessId, user.businessId),
          eq(stockSerialEvents.kind, 'sale'),
          eq(stockSerialEvents.documentId, row.id),
        ),
      )
      .orderBy(asc(stockSerials.code));
    const [orderDelivery] = await tx
      .select({ orderId: customerOrderDeliveries.orderId })
      .from(customerOrderDeliveries)
      .where(
        and(
          eq(customerOrderDeliveries.saleId, row.id),
          eq(customerOrderDeliveries.businessId, user.businessId),
        ),
      );
    return { row, items, invoice: inv ?? null, batches, serials, orderId: orderDelivery?.orderId };
  });

  if (!data) notFound();
  const { row, items, invoice } = data;

  return (
    <div className="space-y-4">
      {data.orderId && (
        <div className="rounded-xl border p-4 text-sm">
          <p>
            This bill records a physical order handover. Payments, unused advances and exact bill
            allocations are tracked in its order ledger.
          </p>
          <Link className="mt-2 inline-block underline" href={`/orders/${data.orderId}`}>
            Open customer order
          </Link>
        </div>
      )}
      {data.serials.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Serials & recorded warranty
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Terms as recorded when this bill was saved. Later changes do not rewrite this record.
            End dates are exclusive, using India time; claim eligibility still depends on the
            issuer’s actual terms.
          </p>
          <ul className="mt-3 divide-y text-sm">
            {data.serials.map((unit) => (
              <li key={unit.id} className="space-y-1 py-3">
                <p className="break-all font-mono font-medium">{unit.code}</p>
                <p className="text-xs text-muted-foreground">
                  {unit.months
                    ? `${unit.months} months · ${unit.issuer} · end ${unit.endsOn}`
                    : 'No warranty recorded'}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.batches.length > 0 && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-semibold">Allocated batches</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Physical lots used for this bill, earliest expiry first.
          </p>
          <ul className="mt-2 divide-y text-sm">
            {data.batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {batch.name} · {batch.code} · expiry {batch.expiresOn}
                </span>
                <span className="tabular-nums">
                  {batch.quantity.replace('-', '')} {batch.unit}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Bill {row.billNo}</CardTitle>
            {row.billType !== 'estimate' && (
              <GenerateInvoiceButton
                saleId={row.id}
                existingPdfKey={invoice?.pdfKey ?? null}
                isGstInvoice={row.gstEnabledAtSale === true && row.billType === 'gst_bill'}
              />
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
