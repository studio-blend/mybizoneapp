import { cashbookRange } from '@/lib/cashbook';
import { describe, expect, it } from 'vitest';
describe('cashbook date ranges', () => {
  it('accepts a single India date and leap day', () => {
    expect(cashbookRange('2024-02-29', '2024-02-29')).toEqual({
      from: '2024-02-29',
      to: '2024-02-29',
    });
  });
  it('rejects impossible dates and reversed periods', () => {
    for (const dates of [
      ['2026-02-30', '2026-03-01'],
      ['2026-10-17', '2026-10-16'],
      ['x', '2026-10-17'],
    ])
      expect(() => cashbookRange(dates[0], dates[1])).toThrow();
  });
  it('bounds a period to 366 days inclusive', () => {
    expect(() => cashbookRange('2025-01-01', '2026-01-01')).not.toThrow();
    expect(() => cashbookRange('2025-01-01', '2026-01-02')).toThrow();
  });
});
