import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Gstr3bData } from './actions';

const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#444', marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 4, backgroundColor: '#eee', padding: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
  headerRow: { flexDirection: 'row', backgroundColor: '#ddd', paddingVertical: 4, fontWeight: 700 },
  col1: { width: '40%', paddingLeft: 4 },
  col2: { width: '15%', textAlign: 'right', paddingRight: 4 },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#000', paddingVertical: 6, fontWeight: 700 },
});

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Gstr3bPdf({ data }: { data: Gstr3bData }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>GSTR-3B Summary</Text>
        <Text style={pdfStyles.subtitle}>
          {data.businessName} | GSTIN: {data.gstin || 'N/A'} | Period: {data.periodFrom} to {data.periodTo}
        </Text>

        <Text style={pdfStyles.sectionTitle}>3.1 Details of Outward Supplies and Inward Supplies</Text>
        <View style={pdfStyles.headerRow}>
          <Text style={pdfStyles.col1}>Nature of Supplies</Text>
          <Text style={pdfStyles.col2}>Taxable Value</Text>
          <Text style={pdfStyles.col2}>IGST</Text>
          <Text style={pdfStyles.col2}>CGST</Text>
          <Text style={pdfStyles.col2}>SGST/UTGST</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(a) Taxable supplies</Text>
          <Text style={pdfStyles.col2}>{fmt(data.outwardTaxable.taxable)}</Text>
          <Text style={pdfStyles.col2}>{fmt(data.outwardTaxable.igst)}</Text>
          <Text style={pdfStyles.col2}>{fmt(data.outwardTaxable.cgst)}</Text>
          <Text style={pdfStyles.col2}>{fmt(data.outwardTaxable.sgst)}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(b) Zero rated supply (Export) on payment of tax</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(c) Exempt / Non-GST supplies</Text>
          <Text style={pdfStyles.col2}>{fmt(data.outwardExempt)}</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(e) Non-GST outward supplies</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>4. Eligible ITC</Text>
        <View style={pdfStyles.headerRow}>
          <Text style={pdfStyles.col1}>Nature of ITC</Text>
          <Text style={pdfStyles.col2}>IGST</Text>
          <Text style={pdfStyles.col2}>CGST</Text>
          <Text style={pdfStyles.col2}>SGST</Text>
          <Text style={pdfStyles.col2}>Cess</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(A) Inward supplies (from reg. persons)</Text>
          <Text style={pdfStyles.col2}>{fmt(data.itcInward.igst)}</Text>
          <Text style={pdfStyles.col2}>{fmt(data.itcInward.cgst)}</Text>
          <Text style={pdfStyles.col2}>{fmt(data.itcInward.sgst)}</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>(B) Import of goods</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
          <Text style={pdfStyles.col2}>0.00</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>5. Net ITC and Tax Payable</Text>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.col1}>Net ITC Available</Text>
          <Text style={pdfStyles.col2}>{fmt(data.netItc)}</Text>
          <Text style={pdfStyles.col2}></Text>
          <Text style={pdfStyles.col2}></Text>
          <Text style={pdfStyles.col2}></Text>
        </View>
        <View style={pdfStyles.totalRow}>
          <Text style={pdfStyles.col1}>5.1 Net Tax Payable</Text>
          <Text style={pdfStyles.col2}>{fmt(data.netPayable)}</Text>
          <Text style={pdfStyles.col2}></Text>
          <Text style={pdfStyles.col2}></Text>
          <Text style={pdfStyles.col2}></Text>
        </View>

        <Text style={{ marginTop: 24, fontSize: 8, color: '#888' }}>
          Note: This is a management summary for reference. Consult a CA for official GSTR-3B filing.
        </Text>
      </Page>
    </Document>
  );
}
