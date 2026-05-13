import { sql } from 'drizzle-orm';
import { billSeries } from './schema/bill-series';

// Inline pure helpers to avoid a domain → db circular dependency.
// These must stay in sync with packages/domain/src/bill-series.ts.

function _formatBillNo(prefix: string, fy: string, seq: number): string {
  const fyShort = fy.split('-').map((s) => s.slice(-2)).join('-');
  return `${prefix}-${fyShort}-${String(seq).padStart(4, '0')}`;
}

/**
 * Atomically increment the FY bill counter for a business + docType.
 * Uses INSERT ... ON CONFLICT DO UPDATE to create the row if it's the first
 * bill of that FY for that docType.
 * Returns the formatted bill number string.
 */
export async function nextBillNo(
  tx: any,
  businessId: string,
  docType: 'sale' | 'invoice' | 'quotation' | 'dc' | 'return',
  financialYear: string,
  prefix = 'GST',
): Promise<string> {
  const [row] = await tx
    .insert(billSeries)
    .values({ businessId, docType, financialYear, prefix, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [billSeries.businessId, billSeries.docType, billSeries.financialYear],
      set: { lastSeq: sql`${billSeries.lastSeq} + 1` },
    })
    .returning({ lastSeq: billSeries.lastSeq, prefix: billSeries.prefix });
  if (!row) throw new Error('bill counter increment failed');
  return _formatBillNo(row.prefix, financialYear, row.lastSeq);
}
