import { round2 } from './money';

/** Principal allocated to one instalment, excluding lender interest. */
export function instalmentPrincipal(
  principal: number,
  downPayment: number,
  tenure: number,
  instalment: number,
): number {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(downPayment) ||
    downPayment < 0 ||
    downPayment > principal ||
    !Number.isInteger(tenure) ||
    tenure < 1 ||
    !Number.isInteger(instalment) ||
    instalment < 1 ||
    instalment > tenure
  ) {
    throw new Error('invalid EMI principal allocation');
  }
  const financed = round2(principal - downPayment);
  return round2(
    round2((financed * instalment) / tenure) - round2((financed * (instalment - 1)) / tenure),
  );
}

/** Keep January 31 payments in February instead of rolling into March. */
export function emiDueDate(startDate: string, monthOffset: number): string {
  const base = new Date(`${startDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !Number.isFinite(base.getTime()) ||
    base.toISOString().slice(0, 10) !== startDate ||
    !Number.isInteger(monthOffset) ||
    monthOffset < 0
  )
    throw new Error('invalid EMI date');
  const day = base.getUTCDate();
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + monthOffset);
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}
