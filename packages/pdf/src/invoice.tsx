/**
 * GST tax invoice + plain receipt PDF templates.
 *
 * Pure React-to-PDF: Document → Page → Views. Renders to a Buffer the
 * Server Action can write through @mybizone/storage. Default Helvetica
 * is bundled by @react-pdf/renderer — no external font fetch, so this
 * works in Next's edge build and in self-hosted Docker without internet.
 *
 * Template format follows Cleartax's standard B2B GST invoice layout.
 * A CA review pre-cutover (M3) is in the M2 risk list.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 8,
    marginBottom: 12,
  },
  bizBlock: { flexDirection: 'column' },
  bizName: { fontSize: 16, fontWeight: 700 },
  bizMeta: { fontSize: 9, color: '#444', marginTop: 2 },
  invoiceBlock: { alignItems: 'flex-end' },
  invoiceLabel: { fontSize: 14, fontWeight: 700 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  partyBox: { width: '48%', borderWidth: 1, borderColor: '#000', padding: 8 },
  partyLabel: { fontSize: 8, color: '#666', textTransform: 'uppercase', marginBottom: 2 },
  partyName: { fontSize: 11, fontWeight: 700 },
  table: { borderWidth: 1, borderColor: '#000' },
  tHeader: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontWeight: 700,
  },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#666' },
  tCell: { padding: 4 },
  cellSr: { width: '6%', textAlign: 'right' },
  cellDesc: { width: '34%' },
  cellHsn: { width: '10%' },
  cellQty: { width: '10%', textAlign: 'right' },
  cellRate: { width: '12%', textAlign: 'right' },
  cellGstRate: { width: '8%', textAlign: 'right' },
  cellGstAmt: { width: '10%', textAlign: 'right' },
  cellTotal: { width: '10%', textAlign: 'right' },
  totalsBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#000',
    padding: 8,
    width: '40%',
    alignSelf: 'flex-end',
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsRowBold: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#000',
    fontWeight: 700,
    fontSize: 12,
  },
  footer: { marginTop: 24, fontSize: 9, color: '#666' },
  signatureLine: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  sigBox: { width: 200, borderTopWidth: 1, borderTopColor: '#000', paddingTop: 4, fontSize: 9 },
});

export interface InvoiceData {
  isGstInvoice: boolean;
  business: {
    name: string;
    gstin: string | null;
    address?: string | null;
  };
  invoice: {
    number: string;
    date: Date;
    isInterstate: boolean;
  };
  customer: {
    name: string | null;
    phone: string | null;
    gstin: string | null;
    address: string | null;
  };
  lines: Array<{
    productName: string;
    hsnCode: string | null;
    qty: string;
    unitSymbol: string;
    unitPrice: string;
    gstRate: string | null;
    gstAmount: string;
    lineTotal: string;
  }>;
  totals: {
    subtotal: string;
    discount: string;
    cgst: string;
    sgst: string;
    igst: string;
    total: string;
  };
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const docTitle = data.isGstInvoice ? 'TAX INVOICE' : 'RECEIPT';
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.bizBlock}>
            <Text style={styles.bizName}>{data.business.name}</Text>
            {data.business.address && <Text style={styles.bizMeta}>{data.business.address}</Text>}
            {data.business.gstin && (
              <Text style={styles.bizMeta}>GSTIN: {data.business.gstin}</Text>
            )}
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceLabel}>{docTitle}</Text>
            <Text style={styles.bizMeta}>Number: {data.invoice.number}</Text>
            <Text style={styles.bizMeta}>
              Date: {data.invoice.date.toLocaleDateString('en-IN')}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{data.customer.name ?? 'Walk-in customer'}</Text>
            {data.customer.phone && <Text style={styles.bizMeta}>{data.customer.phone}</Text>}
            {data.customer.address && <Text style={styles.bizMeta}>{data.customer.address}</Text>}
            {data.customer.gstin && (
              <Text style={styles.bizMeta}>GSTIN: {data.customer.gstin}</Text>
            )}
          </View>
          {data.isGstInvoice && (
            <View style={styles.partyBox}>
              <Text style={styles.partyLabel}>Place of supply</Text>
              <Text style={styles.partyName}>
                {data.invoice.isInterstate ? 'Interstate (IGST)' : 'Intrastate (CGST + SGST)'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tHeader}>
            <Text style={[styles.tCell, styles.cellSr]}>#</Text>
            <Text style={[styles.tCell, styles.cellDesc]}>Description</Text>
            {data.isGstInvoice && <Text style={[styles.tCell, styles.cellHsn]}>HSN</Text>}
            <Text style={[styles.tCell, styles.cellQty]}>Qty</Text>
            <Text style={[styles.tCell, styles.cellRate]}>Rate</Text>
            {data.isGstInvoice && (
              <>
                <Text style={[styles.tCell, styles.cellGstRate]}>GST%</Text>
                <Text style={[styles.tCell, styles.cellGstAmt]}>GST</Text>
              </>
            )}
            <Text style={[styles.tCell, styles.cellTotal]}>Total</Text>
          </View>
          {data.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: react-pdf has no DOM diff; index is stable + rows are render-only.
            <View key={i} style={styles.tRow}>
              <Text style={[styles.tCell, styles.cellSr]}>{i + 1}</Text>
              <Text style={[styles.tCell, styles.cellDesc]}>{l.productName}</Text>
              {data.isGstInvoice && (
                <Text style={[styles.tCell, styles.cellHsn]}>{l.hsnCode ?? '—'}</Text>
              )}
              <Text style={[styles.tCell, styles.cellQty]}>
                {l.qty} {l.unitSymbol}
              </Text>
              <Text style={[styles.tCell, styles.cellRate]}>{l.unitPrice}</Text>
              {data.isGstInvoice && (
                <>
                  <Text style={[styles.tCell, styles.cellGstRate]}>{l.gstRate ?? '—'}</Text>
                  <Text style={[styles.tCell, styles.cellGstAmt]}>{l.gstAmount}</Text>
                </>
              )}
              <Text style={[styles.tCell, styles.cellTotal]}>{l.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{data.totals.subtotal}</Text>
          </View>
          {Number(data.totals.discount) > 0 && (
            <View style={styles.totalsRow}>
              <Text>Discount</Text>
              <Text>- {data.totals.discount}</Text>
            </View>
          )}
          {data.isGstInvoice &&
            (data.invoice.isInterstate ? (
              <View style={styles.totalsRow}>
                <Text>IGST</Text>
                <Text>{data.totals.igst}</Text>
              </View>
            ) : (
              <>
                <View style={styles.totalsRow}>
                  <Text>CGST</Text>
                  <Text>{data.totals.cgst}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text>SGST</Text>
                  <Text>{data.totals.sgst}</Text>
                </View>
              </>
            ))}
          <View style={styles.totalsRowBold}>
            <Text>Total ₹</Text>
            <Text>{data.totals.total}</Text>
          </View>
        </View>

        <View style={styles.signatureLine}>
          <Text style={styles.sigBox}>Authorised signatory</Text>
        </View>

        <Text style={styles.footer}>
          {data.isGstInvoice
            ? 'This is a computer-generated invoice. No signature required if signed digitally.'
            : 'Thank you for your purchase.'}
        </Text>
      </Page>
    </Document>
  );
}

/** Render the template to a Buffer. Server-only — uses Node streams under the hood. */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const stream = await pdf(<InvoiceDocument data={data} />).toBuffer();
  return await streamToBuffer(stream);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}
