/**
 * Pure sale calculation: line subtotals → discount → per-line GST → totals.
 * Stateless: feed it the cart + GST mode; it returns numbers ready for the
 * Server Action to write to sales / sale_items / invoices.
 *
 * Money rounded to 2 decimals at every meaningful step (lines, GST, totals).
 * gstAmount per line is computed on the *post-discount* taxable amount so a
 * shop owner discounting a bill doesn't pay tax on money they didn't collect.
 */
import { round2 } from './money';

export interface SaleLineInput {
  /** Decimal qty as string or number — string preserves NUMERIC(12,3) precision. */
  qty: number;
  /** Price per unit_symbol. */
  unitPrice: number;
  /** GST percent (0–28). null = not GST-billed. */
  gstRate: number | null;
}

export interface SaleLineCalc extends SaleLineInput {
  /** qty * unitPrice rounded to 2dp. Pre-discount. */
  lineSubtotal: number;
  /** Discount amount allocated to this line (proportional to lineSubtotal). */
  lineDiscount: number;
  /** GST amount on (lineSubtotal - lineDiscount). 0 when gstRate is null or gst disabled. */
  gstAmount: number;
  /** lineSubtotal - lineDiscount + gstAmount. */
  lineTotal: number;
}

export interface SaleTotalsInput {
  lines: SaleLineInput[];
  /** Flat amount knocked off the bill. Allocated proportionally across lines. */
  discount?: number;
  /** True only when business has gst_enabled. False short-circuits all GST math. */
  gstEnabled: boolean;
  /** Interstate (IGST) vs intrastate (CGST+SGST split). Only matters when gstEnabled. */
  isInterstate?: boolean;
}

export interface SaleTotalsCalc {
  lines: SaleLineCalc[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export class SaleCalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleCalcError';
  }
}

export function calculateSaleTotals(input: SaleTotalsInput): SaleTotalsCalc {
  if (input.lines.length === 0) {
    throw new SaleCalcError('sale must have at least one line');
  }

  const linesPre = input.lines.map((l) => {
    if (!Number.isFinite(l.qty) || l.qty <= 0) {
      throw new SaleCalcError(`qty must be > 0 (got ${l.qty})`);
    }
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      throw new SaleCalcError(`unitPrice must be >= 0 (got ${l.unitPrice})`);
    }
    return { ...l, lineSubtotal: round2(l.qty * l.unitPrice) };
  });

  const subtotal = round2(linesPre.reduce((s, l) => s + l.lineSubtotal, 0));
  const requestedDiscount = input.discount ?? 0;
  if (requestedDiscount < 0) throw new SaleCalcError('discount must be >= 0');
  if (requestedDiscount > subtotal) throw new SaleCalcError('discount exceeds subtotal');
  const discount = round2(requestedDiscount);
  const taxableAmount = round2(subtotal - discount);

  // Proportionally allocate discount per line. Last line absorbs the rounding remainder
  // so the per-line discounts sum exactly to the bill discount.
  const lines: SaleLineCalc[] = [];
  let allocated = 0;
  for (let i = 0; i < linesPre.length; i++) {
    const l = linesPre[i];
    if (!l) throw new SaleCalcError(`missing line ${i}`);
    const isLast = i === linesPre.length - 1;
    const ratio = subtotal > 0 ? l.lineSubtotal / subtotal : 0;
    const lineDiscount = isLast ? round2(discount - allocated) : round2(discount * ratio);
    allocated = round2(allocated + lineDiscount);

    const lineTaxable = round2(l.lineSubtotal - lineDiscount);
    const gstApplies = input.gstEnabled && l.gstRate !== null && l.gstRate > 0;
    const gstAmount = gstApplies ? round2((lineTaxable * (l.gstRate ?? 0)) / 100) : 0;
    const lineTotal = round2(lineTaxable + gstAmount);

    lines.push({
      qty: l.qty,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
      lineSubtotal: l.lineSubtotal,
      lineDiscount,
      gstAmount,
      lineTotal,
    });
  }

  const taxTotal = round2(lines.reduce((s, l) => s + l.gstAmount, 0));
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.gstEnabled && taxTotal > 0) {
    if (input.isInterstate) {
      igst = taxTotal;
    } else {
      cgst = round2(taxTotal / 2);
      sgst = round2(taxTotal - cgst); // last-cent absorber
    }
  }
  const total = round2(taxableAmount + taxTotal);

  return { lines, subtotal, discount, taxableAmount, taxTotal, cgst, sgst, igst, total };
}
