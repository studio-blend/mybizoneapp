import { describe, expect, it } from 'vitest';
import { calculateProfit } from '../src/profit';

describe('calculateProfit', () => {
  it('returns zero profit and zero coverage for empty lines', () => {
    const r = calculateProfit([]);
    expect(r).toEqual({ estimatedProfit: 0, coveredItems: 0, totalItems: 0 });
  });

  it('calculates profit correctly for lines with cost data', () => {
    const r = calculateProfit([
      { lineTotal: 100, qty: 2, costPriceAtSale: 30 },
      { lineTotal: 50, qty: 1, costPriceAtSale: 20 },
    ]);
    // 100 - 30*2 = 40; 50 - 20*1 = 30 => total 70
    expect(r.estimatedProfit).toBe(70);
    expect(r.coveredItems).toBe(2);
    expect(r.totalItems).toBe(2);
  });

  it('skips lines where costPriceAtSale is null', () => {
    const r = calculateProfit([
      { lineTotal: 100, qty: 2, costPriceAtSale: 30 },
      { lineTotal: 200, qty: 4, costPriceAtSale: null },
    ]);
    expect(r.estimatedProfit).toBe(40);
    expect(r.coveredItems).toBe(1);
    expect(r.totalItems).toBe(2);
  });

  it('reports zero coverage when all costs are null', () => {
    const r = calculateProfit([
      { lineTotal: 500, qty: 5, costPriceAtSale: null },
    ]);
    expect(r.estimatedProfit).toBe(0);
    expect(r.coveredItems).toBe(0);
    expect(r.totalItems).toBe(1);
  });

  it('handles negative margin (cost > price)', () => {
    const r = calculateProfit([
      { lineTotal: 50, qty: 1, costPriceAtSale: 80 },
    ]);
    expect(r.estimatedProfit).toBe(-30);
  });
});
