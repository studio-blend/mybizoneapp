import { describe, expect, it } from 'vitest';
import {
  UNIT_SYMBOLS_BY_TYPE,
  UNIT_TYPES,
  allowsFractionalQty,
  formatQty,
  isUnitType,
  isValidUnit,
  symbolsFor,
} from '../src/catalog';

describe('UNIT_TYPES', () => {
  it('contains the canonical 5 types', () => {
    expect(UNIT_TYPES).toEqual(['piece', 'weight', 'length', 'area', 'volume']);
  });
  it('every type has at least one symbol', () => {
    for (const t of UNIT_TYPES) {
      expect(UNIT_SYMBOLS_BY_TYPE[t].length).toBeGreaterThan(0);
    }
  });
});

describe('isUnitType', () => {
  it('accepts known types', () => {
    expect(isUnitType('weight')).toBe(true);
  });
  it('rejects unknown types', () => {
    expect(isUnitType('count')).toBe(false);
  });
});

describe('isValidUnit', () => {
  it('accepts type+symbol pairs', () => {
    expect(isValidUnit('weight', 'kg')).toBe(true);
    expect(isValidUnit('length', 'cm')).toBe(true);
    expect(isValidUnit('piece', 'pc')).toBe(true);
  });
  it('rejects type+symbol cross', () => {
    expect(isValidUnit('weight', 'cm')).toBe(false);
  });
  it('rejects unknown type', () => {
    expect(isValidUnit('count', 'pc')).toBe(false);
  });
});

describe('symbolsFor', () => {
  it('returns all weight symbols', () => {
    expect(symbolsFor('weight')).toContain('kg');
    expect(symbolsFor('weight')).toContain('g');
  });
});

describe('allowsFractionalQty', () => {
  it('weight, length, area, volume allow fractional', () => {
    expect(allowsFractionalQty('weight')).toBe(true);
    expect(allowsFractionalQty('length')).toBe(true);
    expect(allowsFractionalQty('area')).toBe(true);
    expect(allowsFractionalQty('volume')).toBe(true);
  });
  it('piece does not', () => {
    expect(allowsFractionalQty('piece')).toBe(false);
  });
});

describe('formatQty', () => {
  it('renders integer + symbol', () => {
    expect(formatQty(3, 'pc')).toBe('3 pc');
  });
  it('renders fractional + symbol', () => {
    expect(formatQty('1.5', 'kg')).toBe('1.5 kg');
  });
  it('handles non-numeric input gracefully', () => {
    expect(formatQty('abc', 'kg')).toBe('abc kg');
  });
});
