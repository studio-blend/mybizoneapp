import { describe, expect, it } from 'vitest';
import { emiDueDate, instalmentPrincipal } from '../src/emi';

describe('EMI principal and due dates', () => {
  it('excludes down payment and allocates the final paisa across all instalments', () => {
    expect([1, 2, 3].map((i) => instalmentPrincipal(110, 10, 3, i))).toEqual([33.33, 33.34, 33.33]);
  });
  it('rejects invalid financing and instalment indices', () => {
    expect(() => instalmentPrincipal(100, 101, 12, 1)).toThrow();
    expect(() => instalmentPrincipal(100, 0, 12, 13)).toThrow();
    expect(() => instalmentPrincipal(100, -1, 12, 1)).toThrow();
  });
  it('clamps month-end payments, including leap years', () => {
    expect(emiDueDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(emiDueDate('2024-01-31', 1)).toBe('2024-02-29');
    expect(emiDueDate('2026-01-31', 2)).toBe('2026-03-31');
    expect(emiDueDate('2026-12-31', 1)).toBe('2027-01-31');
  });
  it('rejects nonexistent dates before creating a schedule', () => {
    expect(() => emiDueDate('2026-02-30', 1)).toThrow();
    expect(() => emiDueDate('garbage', 1)).toThrow();
  });
});
