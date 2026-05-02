/**
 * Money helpers. NUMERIC(12,2) → string in/out at the DB boundary.
 * In-process arithmetic: integer paise (1 INR = 100 paise) to avoid float drift.
 *
 * GST math, sale totals, etc. land here in M2.
 */

export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === 'string' ? Number.parseFloat(rupees) : rupees;
  if (!Number.isFinite(n)) throw new Error(`invalid amount: ${rupees}`);
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
