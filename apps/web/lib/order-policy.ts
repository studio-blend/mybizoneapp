import { stockUnits } from './stock-batch-policy';
export function moneyCents(value: string): number {
  if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid order money amount');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (negative ? -1 : 1);
}
export function centsText(value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999)
    throw new Error('Order amount exceeds supported precision');
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);
  return `${sign}${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}
// Cumulative rounding makes any sequence of partial handovers sum to the agreement.
export function deliveredShare(
  total: string,
  ordered: string,
  delivered: string,
  quantity: string,
): string {
  const all = stockUnits(ordered);
  const before = stockUnits(delivered);
  const qty = stockUnits(quantity);
  const cents = moneyCents(total);
  if (cents < 0 || !all || !qty || before + qty > all)
    throw new Error('Delivery exceeds the remaining order quantity');
  const share = (n: number) =>
    Number((2n * BigInt(cents) * BigInt(n) + BigInt(all)) / (2n * BigInt(all)));
  return centsText(share(before + qty) - share(before));
}
export function orderFulfilment(status: string, ordered: number, delivered: number): string {
  if (status === 'cancelled') return delivered ? 'Cancelled remainder' : 'Cancelled';
  return delivered >= ordered ? 'Delivered' : delivered ? 'Part delivered' : 'Awaiting delivery';
}
