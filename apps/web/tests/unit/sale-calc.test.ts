import { describe, expect, it } from 'vitest';
import { SaleCalcError, calculateSaleTotals } from '@mybizone/domain/sale';

describe('calculateSaleTotals — no GST', () => {
  it('single line, no discount', () => {
    const r = calculateSaleTotals({
      gstEnabled: false,
      lines: [{ qty: 2, unitPrice: 500, gstRate: 18 }],
    });
    expect(r.subtotal).toBe(1000);
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(1000);
    expect(r.lines[0]?.gstAmount).toBe(0);
  });

  it('discount applied, total reduced', () => {
    const r = calculateSaleTotals({
      gstEnabled: false,
      discount: 100,
      lines: [{ qty: 1, unitPrice: 600, gstRate: null }],
    });
    expect(r.subtotal).toBe(600);
    expect(r.discount).toBe(100);
    expect(r.total).toBe(500);
  });
});

describe('calculateSaleTotals — with GST (intrastate)', () => {
  it('18% GST splits into CGST + SGST', () => {
    const r = calculateSaleTotals({
      gstEnabled: true,
      isInterstate: false,
      lines: [{ qty: 1, unitPrice: 1000, gstRate: 18 }],
    });
    expect(r.taxTotal).toBe(180);
    expect(r.cgst).toBe(90);
    expect(r.sgst).toBe(90);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(1180);
  });

  it('interstate sale uses IGST, no CGST/SGST', () => {
    const r = calculateSaleTotals({
      gstEnabled: true,
      isInterstate: true,
      lines: [{ qty: 1, unitPrice: 1000, gstRate: 18 }],
    });
    expect(r.igst).toBe(180);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
  });

  it('GST computed on post-discount taxable amount', () => {
    const r = calculateSaleTotals({
      gstEnabled: true,
      discount: 200,
      lines: [{ qty: 1, unitPrice: 1200, gstRate: 18 }],
    });
    // taxable = 1200 - 200 = 1000; GST = 180
    expect(r.taxableAmount).toBe(1000);
    expect(r.taxTotal).toBe(180);
    expect(r.total).toBe(1180);
  });

  it('null gstRate line has 0 GST even when gstEnabled', () => {
    const r = calculateSaleTotals({
      gstEnabled: true,
      lines: [{ qty: 1, unitPrice: 500, gstRate: null }],
    });
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(500);
  });

  it('mixed GST rates — multiple lines', () => {
    const r = calculateSaleTotals({
      gstEnabled: true,
      lines: [
        { qty: 1, unitPrice: 1000, gstRate: 18 }, // 180 GST
        { qty: 2, unitPrice: 500, gstRate: 12 },  // 120 GST
      ],
    });
    expect(r.subtotal).toBe(2000);
    expect(r.taxTotal).toBe(300);
    expect(r.total).toBe(2300);
  });

  it('discount proportionally allocated across lines', () => {
    const r = calculateSaleTotals({
      gstEnabled: false,
      discount: 200,
      lines: [
        { qty: 1, unitPrice: 600, gstRate: null }, // 60% of subtotal
        { qty: 1, unitPrice: 400, gstRate: null }, // 40% of subtotal
      ],
    });
    // Line 1 discount: 200 * 0.6 = 120; Line 2: 80
    expect(r.lines[0]?.lineDiscount).toBe(120);
    expect(r.lines[1]?.lineDiscount).toBe(80);
    expect(r.total).toBe(800);
  });
});

describe('calculateSaleTotals — error cases', () => {
  it('throws on empty lines', () => {
    expect(() => calculateSaleTotals({ gstEnabled: false, lines: [] }))
      .toThrow(SaleCalcError);
  });

  it('throws on negative qty', () => {
    expect(() =>
      calculateSaleTotals({ gstEnabled: false, lines: [{ qty: -1, unitPrice: 100, gstRate: null }] })
    ).toThrow(SaleCalcError);
  });

  it('throws on discount exceeding subtotal', () => {
    expect(() =>
      calculateSaleTotals({
        gstEnabled: false,
        discount: 999,
        lines: [{ qty: 1, unitPrice: 100, gstRate: null }],
      })
    ).toThrow(SaleCalcError);
  });
});
