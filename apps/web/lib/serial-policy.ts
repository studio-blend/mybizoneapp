import { indiaToday } from './stock-batch-policy';

export function serialCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9./_-]{0,79}$/.test(code))
    throw new Error('Serials use 1–80 letters, numbers, dots, slashes, underscores or hyphens');
  return code;
}
export function serialCodes(values: string[]): string[] {
  if (values.length > 500) throw new Error('Record at most 500 serials per product line');
  const codes = values.map(serialCode);
  if (new Set(codes).size !== codes.length) throw new Error('Each serial number must be different');
  return codes;
}
export function parseSerialText(value: string): string[] {
  return value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
export function serialCount(qty: string): number {
  const count = Number(qty);
  if (!/^\d{1,9}(?:\.0{1,3})?$/.test(qty) || !Number.isInteger(count) || count < 0)
    throw new Error('Serialized products require whole pieces');
  return count;
}
// End date is exclusive. Clip month ends (31 Jan + 1 month = 28/29 Feb).
export function warrantyEnd(soldAt: Date, months: number): string | null {
  if (!Number.isInteger(months) || months < 0 || months > 120)
    throw new Error('Warranty must be 0–120 months');
  if (!months) return null;
  const start = indiaToday(soldAt);
  const [year, month, day] = start.split('-').map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day!, last));
  return target.toISOString().slice(0, 10);
}
