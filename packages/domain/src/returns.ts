import { round2 } from './money';

export interface ReturnSourceLine {
  productId: string | null;
  qty: string;
  lineTotal: string;
  gstAmount: string;
}

/** Value returns from the original invoice, including its discounts and GST.
 * Cumulative allocation preserves the last paisa across partial returns.
 * Caller must lock the original document before reading previous returns.
 */
export function calculateReturnLines(
  source: ReturnSourceLine[],
  previous: ReturnSourceLine[],
  requested: { productId: string; qty: string }[],
) {
  const quantity = (v: string) => Math.round(Number(v) * 1000);
  const seen = new Set<string>();
  return requested.map((item) => {
    if (seen.has(item.productId))
      throw new Error('combine duplicate products into one return line');
    seen.add(item.productId);
    const originals = source.filter((line) => line.productId === item.productId);
    if (!originals.length) throw new Error('product is not on the original bill');
    const prior = previous.filter((line) => line.productId === item.productId);
    const soldQty = originals.reduce((n, line) => n + quantity(line.qty), 0);
    const returnedQty = prior.reduce((n, line) => n + quantity(line.qty), 0);
    const qty = quantity(item.qty);
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('return quantity must be positive');
    if (qty + returnedQty > soldQty)
      throw new Error('return quantity exceeds remaining quantity on original bill');
    const refund = (field: 'lineTotal' | 'gstAmount') => {
      const original = round2(originals.reduce((n, line) => n + Number(line[field]), 0));
      const already = round2(prior.reduce((n, line) => n + Number(line[field]), 0));
      const value = round2(round2((original * (returnedQty + qty)) / soldQty) - already);
      if (!Number.isFinite(value) || value < 0 || value > round2(original - already)) {
        throw new Error('previous return amounts require reconciliation');
      }
      return value.toFixed(2);
    };
    return { ...item, lineTotal: refund('lineTotal'), gstAmount: refund('gstAmount') };
  });
}
