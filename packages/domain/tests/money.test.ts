import { describe, expect, it } from 'vitest';
import { paiseToRupees, round2, rupeesToPaise } from '../src/money';

describe('money', () => {
  it('rupees ↔ paise round-trips', () => {
    expect(rupeesToPaise('123.45')).toBe(12345);
    expect(paiseToRupees(12345)).toBe('123.45');
  });

  it('handles 0.1 + 0.2 without float drift', () => {
    const sum = rupeesToPaise(0.1) + rupeesToPaise(0.2);
    expect(paiseToRupees(sum)).toBe('0.30');
  });

  it('rejects garbage', () => {
    expect(() => rupeesToPaise('abc')).toThrow();
  });

  it('round2', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.4999)).toBe(2.5);
  });
});
