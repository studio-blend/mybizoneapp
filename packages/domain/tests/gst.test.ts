import { describe, expect, it } from 'vitest';
import { gstinStateCode, gstinStateName, isInterstate, isValidGstin } from '../src/gst';

const VALID_MAHARASHTRA = '27AAAPL1234C1Z5';
const VALID_KARNATAKA = '29AAAPL1234C1Z5';
const VALID_TAMIL_NADU = '33AAAPL1234C1Z5';
const INVALID = 'not-a-gstin';

describe('isValidGstin', () => {
  it('accepts well-formed GSTINs', () => {
    expect(isValidGstin(VALID_MAHARASHTRA)).toBe(true);
    expect(isValidGstin(VALID_KARNATAKA)).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidGstin(INVALID)).toBe(false);
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin('27AAAPL1234C1Z')).toBe(false); // too short
  });
});

describe('gstinStateCode + gstinStateName', () => {
  it('extracts state code', () => {
    expect(gstinStateCode(VALID_MAHARASHTRA)).toBe('27');
    expect(gstinStateCode(VALID_TAMIL_NADU)).toBe('33');
  });
  it('returns null for invalid GSTINs', () => {
    expect(gstinStateCode(INVALID)).toBeNull();
  });
  it('maps to state name', () => {
    expect(gstinStateName(VALID_MAHARASHTRA)).toBe('Maharashtra');
    expect(gstinStateName(VALID_TAMIL_NADU)).toBe('Tamil Nadu');
  });
});

describe('isInterstate', () => {
  it('same state → false', () => {
    expect(isInterstate(VALID_MAHARASHTRA, VALID_MAHARASHTRA)).toBe(false);
  });
  it('different states → true', () => {
    expect(isInterstate(VALID_MAHARASHTRA, VALID_KARNATAKA)).toBe(true);
    expect(isInterstate(VALID_MAHARASHTRA, VALID_TAMIL_NADU)).toBe(true);
  });
  it('missing customer GSTIN → null (UI toggle)', () => {
    expect(isInterstate(VALID_MAHARASHTRA, null)).toBeNull();
  });
  it('missing supplier GSTIN → null', () => {
    expect(isInterstate(null, VALID_KARNATAKA)).toBeNull();
  });
  it('invalid input on either side → null', () => {
    expect(isInterstate(VALID_MAHARASHTRA, INVALID)).toBeNull();
    expect(isInterstate(INVALID, VALID_KARNATAKA)).toBeNull();
  });
});
