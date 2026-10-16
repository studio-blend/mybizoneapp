// Quantities use integer thousandths. Never round an invalid input into valid stock.
export function stockUnits(value: string): number {
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(value)) throw new Error('Invalid stock quantity');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export function stockText(units: number): string {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error('Invalid stock quantity');
  return `${Math.floor(units / 1000)}.${String(units % 1000).padStart(3, '0')}`;
}

export function validExpiry(value: string): boolean {
  return (
    /^(?:19|[2-9]\d)\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function indiaToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function expiryStatus(
  state: string,
  expiresOn: string | null,
  today: string,
): 'quarantine' | 'expired' | 'soon' | 'available' {
  if (state === 'quarantine') return 'quarantine';
  if (!expiresOn || expiresOn <= today) return 'expired';
  const days =
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 30 ? 'soon' : 'available';
}
