import {
  expiryStatus,
  indiaToday,
  stockText,
  stockUnits,
  validExpiry,
} from '@/lib/stock-batch-policy';
import { describe, expect, it } from 'vitest';
describe('stock batch policy', () => {
  it('keeps fractional stock exact at supported limits', () => {
    expect(stockText(stockUnits('999999999.999'))).toBe('999999999.999');
    expect(stockText(stockUnits('0.1') + stockUnits('0.2'))).toBe('0.300');
    for (const value of ['1.0001', '-1', '1e3', 'NaN', '1000000000', ''])
      expect(() => stockUnits(value)).toThrow();
  });
  it('validates real calendar dates', () => {
    expect(validExpiry('2028-02-29')).toBe(true);
    for (const value of ['2026-02-29', '2026-04-31', '2026-1-01', 'bad'])
      expect(validExpiry(value)).toBe(false);
  });
  it('uses India midnight and blocks the printed expiry date', () => {
    expect(indiaToday(new Date('2026-10-15T18:29:59Z'))).toBe('2026-10-15');
    expect(indiaToday(new Date('2026-10-15T18:30:00Z'))).toBe('2026-10-16');
    expect(expiryStatus('available', '2026-10-16', '2026-10-16')).toBe('expired');
    expect(expiryStatus('available', '2026-11-15', '2026-10-16')).toBe('soon');
    expect(expiryStatus('available', '2026-11-16', '2026-10-16')).toBe('available');
    expect(expiryStatus('quarantine', null, '2026-10-16')).toBe('quarantine');
  });
});
