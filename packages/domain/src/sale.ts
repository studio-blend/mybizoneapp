/**
 * Pure sale calculation: line subtotals → per-line item discount → bill-level discount
 * (proportional) → per-line GST → totals. Stateless: feed it the cart + GST mode;
 * it returns numbers ready for the Server Action to write to sales / sale_items.
 *
 * Money rounded to 2 decimals at every meaningful step (lines, GST, totals).
 * gstAmount per line is computed on the *post-discount* taxable amount so a shop
 * owner discounting a bill doesn't pay tax on money they didn't collect.
 *
 * M8 additions:
 *   - itemDiscount (per-line ₹) subtracted from lineSubtotal BEFORE the proportional
 *     bill-discount split. GST applies on (lineSubtotal − itemDiscount − billDiscount).
 *   - isFreeItem coerces lineTotal + gstAmount to 0; the line's full subtotal is
 *     written to lineDiscount so totals reconcile.
 */
import { round2 } from './money';

export interface SaleLineInput {
  /** Decimal qty as string or number — string preserves NUMERIC(12,3) precision. */
  qty: number;
  /** Price per unit_symbol. */
  unitPrice: number;
  /** GST percent (0–28). null = not GST-billed. */
  gstRate: number | null;
  /** Per-line ₹ discount, applied BEFORE bill-level discount allocation. Default 0. */
  itemDiscount?: number;
  /** If true: lineTotal=0, gstAmount=0, lineDiscount=lineSubtotal. Bill is unaffected. */
  isFreeItem?: boolean;
}

export interface SaleLineCalc extends SaleLineInput {
  /** qty * unitPrice rounded to 2dp. Pre-discount. */
  lineSubtotal: number;
  /** Total discount on this line: itemDiscount + proportional bill-level discount (+ full subtotal if free). */
  lineDiscount: number;
  /** GST amount on (lineSubtotal - lineDiscount). 0 when gstRate is null, gst disabled, or isFreeItem. */
  gstAmount: number;
  /** lineSubtotal - lineDiscount + gstAmount. 0 for free items. */
  lineTotal: number;
}

export interface SaleTotalsInput {
  lines: SaleLineInput[];
  /** Flat amount knocked off the bill (post-itemDiscount). Allocated proportionally across non-free lines. */
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

  // Pass 1: compute lineSubtotal + validate per-line itemDiscount.
  const linesPre = input.lines.map((l) => {
    if (!Number.isFinite(l.qty) || l.qty <= 0) {
      throw new SaleCalcError(`qty must be > 0 (got ${l.qty})`);
    }
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      throw new SaleCalcError(`unitPrice must be >= 0 (got ${l.unitPrice})`);
    }
    const lineSubtotal = round2(l.qty * l.unitPrice);
    const itemDiscount = round2(l.itemDiscount ?? 0);
    if (itemDiscount < 0) {
      throw new SaleCalcError(`itemDiscount must be >= 0 (got ${itemDiscount})`);
    }
    if (itemDiscount > lineSubtotal) {
      throw new SaleCalcError(`itemDiscount exceeds line subtotal (line ₹${lineSubtotal}, disc ₹${itemDiscount})`);
    }
    return {
      ...l,
      lineSubtotal,
      itemDiscount,
      isFreeItem: l.isFreeItem === true,
    };
  });

  // Pre-item-discount subtotal (sum of qty*price). Used as the displayed "subtotal" on the bill.
  const subtotal = round2(linesPre.reduce((s, l) => s + l.lineSubtotal, 0));

  // Post-item-discount, pre-bill-discount value. Free lines contribute 0 since they're effectively
  // 100% discounted by the free flag — proportional bill-discount allocation must skip them too.
  const allocBase = round2(
    linesPre.reduce((s, l) => s + (l.isFreeItem ? 0 : l.lineSubtotal - l.itemDiscount), 0),
  );

  const requestedDiscount = input.discount ?? 0;
  if (requestedDiscount < 0) throw new SaleCalcError('discount must be >= 0');
  if (requestedDiscount > allocBase) {
    throw new SaleCalcError('discount exceeds subtotal');
  }
  const discount = round2(requestedDiscount);

  // Pass 2: allocate bill-level discount proportionally across non-free lines, then GST.
  // Find the last non-free line so it absorbs the rounding remainder.
  let lastNonFreeIdx = -1;
  for (let i = linesPre.length - 1; i >= 0; i--) {
    if (linesPre[i] && !linesPre[i]?.isFreeItem) {
      lastNonFreeIdx = i;
      break;
    }
  }

  const lines: SaleLineCalc[] = [];
  let allocated = 0;
  for (let i = 0; i < linesPre.length; i++) {
    const l = linesPre[i];
    if (!l) throw new SaleCalcError(`missing line ${i}`);

    if (l.isFreeItem) {
      // Free items absorb their entire subtotal as discount; no GST, no contribution to total.
      lines.push({
        qty: l.qty,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
        itemDiscount: l.itemDiscount,
        isFreeItem: true,
        lineSubtotal: l.lineSubtotal,
        lineDiscount: l.lineSubtotal,
        gstAmount: 0,
        lineTotal: 0,
      });
      continue;
    }

    const postItem = round2(l.lineSubtotal - l.itemDiscount);
    const isLastNonFree = i === lastNonFreeIdx;
    const ratio = allocBase > 0 ? postItem / allocBase : 0;
    const billLineDiscount = isLastNonFree ? round2(discount - allocated) : round2(discount * ratio);
    allocated = round2(allocated + billLineDiscount);

    const lineTaxable = round2(postItem - billLineDiscount);
    const gstApplies = input.gstEnabled && l.gstRate !== null && l.gstRate > 0;
    const gstAmount = gstApplies ? round2((lineTaxable * (l.gstRate ?? 0)) / 100) : 0;
    const lineTotal = round2(lineTaxable + gstAmount);

    lines.push({
      qty: l.qty,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
      itemDiscount: l.itemDiscount,
      isFreeItem: false,
      lineSubtotal: l.lineSubtotal,
      // Persisted lineDiscount = itemDiscount + bill-level allocation (so reports balance).
      lineDiscount: round2(l.itemDiscount + billLineDiscount),
      gstAmount,
      lineTotal,
    });
  }

  // Total discount visible on the bill summary = item discounts + bill-level discount.
  const totalItemDiscount = round2(linesPre.reduce((s, l) => s + (l.isFreeItem ? l.lineSubtotal : l.itemDiscount), 0));
  const summaryDiscount = round2(totalItemDiscount + discount);
  const taxableAmount = round2(subtotal - summaryDiscount);

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

  return {
    lines,
    subtotal,
    discount: summaryDiscount,
    taxableAmount,
    taxTotal,
    cgst,
    sgst,
    igst,
    total,
  };
}
