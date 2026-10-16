import {
  parseSerialText,
  serialCode,
  serialCodes,
  serialCount,
  warrantyEnd,
} from '@/lib/serial-policy';
import { describe, expect, it } from 'vitest';
describe('serial and recorded warranty policy', () => {
  it('normalizes scan input and rejects duplicates or malformed identifiers', () => {
    expect(serialCode(' ab-12/34 ')).toBe('AB-12/34');
    expect(parseSerialText('A\r\n B, C\n\n')).toEqual(['A', 'B', 'C']);
    expect(() => serialCodes(['a', 'A'])).toThrow();
    for (const value of ['', 'A B', '<SCRIPT>', 'A'.repeat(81)])
      expect(() => serialCode(value)).toThrow();
  });
  it('requires whole pieces without rounding fractional stock', () => {
    expect(serialCount('12.000')).toBe(12);
    expect(serialCount('0')).toBe(0);
    for (const qty of ['0.5', '-1', '1e2', 'NaN', '1000000000'])
      expect(() => serialCount(qty)).toThrow();
  });
  it('clips month ends and uses the sale date in India time', () => {
    expect(warrantyEnd(new Date('2026-01-31T10:00:00Z'), 1)).toBe('2026-02-28');
    expect(warrantyEnd(new Date('2028-01-31T10:00:00Z'), 1)).toBe('2028-02-29');
    expect(warrantyEnd(new Date('2028-02-29T10:00:00Z'), 12)).toBe('2029-02-28');
    expect(warrantyEnd(new Date('2026-01-30T18:30:00Z'), 1)).toBe('2026-02-28');
    expect(warrantyEnd(new Date(), 0)).toBe(null);
    expect(() => warrantyEnd(new Date(), 121)).toThrow();
  });
});
