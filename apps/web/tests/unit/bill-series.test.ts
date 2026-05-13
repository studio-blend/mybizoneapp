import { describe, expect, it } from 'vitest';
import { formatBillNo, getFinancialYear } from '@mybizone/domain/bill-series';

describe('getFinancialYear', () => {
  it('April 1 starts new FY', () => {
    expect(getFinancialYear(new Date('2025-04-01'))).toBe('2025-26');
  });
  it('March 31 is tail of previous FY', () => {
    expect(getFinancialYear(new Date('2026-03-31'))).toBe('2025-26');
  });
  it('January mid-FY', () => {
    expect(getFinancialYear(new Date('2026-01-15'))).toBe('2025-26');
  });
  it('April of the following year starts next FY', () => {
    expect(getFinancialYear(new Date('2026-04-01'))).toBe('2026-27');
  });
  it('FY crossing decade boundary', () => {
    expect(getFinancialYear(new Date('2029-11-01'))).toBe('2029-30');
  });
});

describe('formatBillNo', () => {
  it('pads seq to 4 digits', () => {
    expect(formatBillNo('GST', '2025-26', 1)).toBe('GST-25-26-0001');
  });
  it('seq 42 is zero-padded', () => {
    expect(formatBillNo('GST', '2025-26', 42)).toBe('GST-25-26-0042');
  });
  it('seq 1000 is not padded further', () => {
    expect(formatBillNo('GST', '2025-26', 1000)).toBe('GST-25-26-1000');
  });
  it('RET prefix for returns', () => {
    expect(formatBillNo('RET', '2025-26', 7)).toBe('RET-25-26-0007');
  });
  it('DC prefix for delivery challans', () => {
    expect(formatBillNo('DC', '2025-26', 3)).toBe('DC-25-26-0003');
  });
  it('QT prefix for quotations', () => {
    expect(formatBillNo('QT', '2025-26', 99)).toBe('QT-25-26-0099');
  });
  it('PB prefix for purchase bills', () => {
    expect(formatBillNo('PB', '2026-27', 1)).toBe('PB-26-27-0001');
  });
});
