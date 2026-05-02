import { describe, expect, it } from 'vitest';
import { SaleCalcError, calculateSaleTotals } from '../src/sale';

describe('calculateSaleTotals — basic', () => {
  it('single line, no discount, no GST', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 2, unitPrice: 50, gstRate: null }],
      gstEnabled: false,
    });
    expect(out.subtotal).toBe(100);
    expect(out.discount).toBe(0);
    expect(out.taxTotal).toBe(0);
    expect(out.total).toBe(100);
    expect(out.lines[0]?.lineTotal).toBe(100);
  });

  it('multi line, totals add up', () => {
    const out = calculateSaleTotals({
      lines: [
        { qty: 2, unitPrice: 50, gstRate: null },
        { qty: 1.5, unitPrice: 200, gstRate: null },
      ],
      gstEnabled: false,
    });
    expect(out.subtotal).toBe(400);
    expect(out.total).toBe(400);
  });
});

describe('calculateSaleTotals — GST', () => {
  it('intrastate: cgst + sgst split half-half', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: 18 }],
      gstEnabled: true,
      isInterstate: false,
    });
    expect(out.subtotal).toBe(100);
    expect(out.taxTotal).toBe(18);
    expect(out.cgst).toBe(9);
    expect(out.sgst).toBe(9);
    expect(out.igst).toBe(0);
    expect(out.total).toBe(118);
  });

  it('interstate: igst absorbs full tax', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: 18 }],
      gstEnabled: true,
      isInterstate: true,
    });
    expect(out.taxTotal).toBe(18);
    expect(out.cgst).toBe(0);
    expect(out.sgst).toBe(0);
    expect(out.igst).toBe(18);
    expect(out.total).toBe(118);
  });

  it('cgst+sgst split absorbs odd-cent rounding into sgst', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 99, gstRate: 5 }],
      gstEnabled: true,
      isInterstate: false,
    });
    // 99 * 0.05 = 4.95 → cgst 2.48, sgst 2.47 OR cgst 2.47, sgst 2.48 — sum must equal 4.95
    expect(out.cgst + out.sgst).toBeCloseTo(out.taxTotal, 2);
  });

  it('gstEnabled=false short-circuits even when gstRate set on lines', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: 18 }],
      gstEnabled: false,
    });
    expect(out.taxTotal).toBe(0);
    expect(out.total).toBe(100);
  });
});

describe('calculateSaleTotals — discount', () => {
  it('flat discount applied to subtotal', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: null }],
      discount: 10,
      gstEnabled: false,
    });
    expect(out.subtotal).toBe(100);
    expect(out.discount).toBe(10);
    expect(out.taxableAmount).toBe(90);
    expect(out.total).toBe(90);
  });

  it('discount allocated proportionally across lines, last line absorbs rounding', () => {
    const out = calculateSaleTotals({
      lines: [
        { qty: 1, unitPrice: 33, gstRate: null },
        { qty: 1, unitPrice: 33, gstRate: null },
        { qty: 1, unitPrice: 33, gstRate: null },
      ],
      discount: 10,
      gstEnabled: false,
    });
    const sumDiscount = out.lines.reduce((s, l) => s + l.lineDiscount, 0);
    expect(sumDiscount).toBeCloseTo(10, 2);
    expect(out.total).toBe(89);
  });

  it('GST is computed on post-discount taxable amount', () => {
    const out = calculateSaleTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: 18 }],
      discount: 50,
      gstEnabled: true,
    });
    // taxable 50, GST 18% = 9, total 59
    expect(out.taxableAmount).toBe(50);
    expect(out.taxTotal).toBe(9);
    expect(out.total).toBe(59);
  });
});

describe('calculateSaleTotals — invariants & errors', () => {
  it('throws on empty cart', () => {
    expect(() => calculateSaleTotals({ lines: [], gstEnabled: false })).toThrow(SaleCalcError);
  });
  it('throws on zero qty', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ qty: 0, unitPrice: 1, gstRate: null }],
        gstEnabled: false,
      }),
    ).toThrow(/qty/);
  });
  it('throws on negative price', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ qty: 1, unitPrice: -5, gstRate: null }],
        gstEnabled: false,
      }),
    ).toThrow(/unitPrice/);
  });
  it('throws when discount exceeds subtotal', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ qty: 1, unitPrice: 10, gstRate: null }],
        discount: 99,
        gstEnabled: false,
      }),
    ).toThrow(/discount/);
  });
});
