/**
 * Return the Indian financial year string for a given date.
 * India FY: April 1 → March 31. April 1 2025 → '2025-26', Jan 15 2026 → '2025-26'.
 */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** Alias kept for backwards compatibility with existing imports. */
export const financialYear = getFinancialYear;

/**
 * Build the display bill number from prefix, FY, and sequence.
 * e.g. prefix='GST', fy='2025-26', seq=42 → 'GST-25-26-0042'
 * The FY is abbreviated to last 2 digits each half: '2025-26' → '25-26'.
 */
export function formatBillNo(prefix: string, financialYear: string, seq: number): string {
  // '2025-26' → '25-26'
  const fyShort = financialYear.split('-').map((s) => s.slice(-2)).join('-');
  return `${prefix}-${fyShort}-${String(seq).padStart(4, '0')}`;
}
