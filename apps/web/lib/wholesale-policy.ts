import { indiaToday } from './stock-batch-policy';
export interface PriceTiers {
  price: string;
  wholesalePrice?: string | null;
  mrp?: string | null;
  rate1?: string | null;
  rate2?: string | null;
  rate3?: string | null;
  rate4?: string | null;
}
export function customerPrice(product: PriceTiers, category: string) {
  const key = (
    {
      wholesale: 'wholesalePrice',
      mrp: 'mrp',
      dealer: 'rate1',
      rate1: 'rate1',
      rate2: 'rate2',
      rate3: 'rate3',
      rate4: 'rate4',
    } as const
  )[category as 'wholesale'];
  return (key ? product[key] : null) ?? product.price;
}
export function creditDueDate(days: number, today = indiaToday()) {
  if (!Number.isInteger(days) || days < 0 || days > 365)
    throw new Error('Credit days must be between 0 and 365');
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
