import { z } from 'zod/v3';
import { indiaToday } from './stock-batch-policy';
export const moneySourceKinds = [
  'sale',
  'sales_settlement',
  'purchase',
  'purchase_settlement',
  'order_payment',
  'emi_down',
  'emi_payment',
  'expense',
  'accounting_event',
] as const;
export const moneyCommands = [
  'account',
  'opening',
  'source',
  'transfer',
  'clear',
  'bounce',
  'cancel',
  'reverse',
  'offset',
] as const;
const amount = z.string().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/);
export const moneyCommandSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(moneyCommands),
  name: z.string().trim().min(2).max(80).optional(),
  accountKind: z.enum(['cash', 'bank']).optional(),
  accountId: z.string().uuid().optional(),
  toAccountId: z.string().uuid().optional(),
  postingId: z.string().uuid().optional(),
  sourceKind: z.enum(moneySourceKinds).optional(),
  sourceId: z.string().uuid().optional(),
  correctionId: z.string().uuid().optional(),
  amount: amount.optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().min(3).max(100),
  note: z.string().trim().min(3).max(500),
});
export type MoneyInput = z.infer<typeof moneyCommandSchema>;
export function moneyDay(day: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day ||
    day > indiaToday()
  )
    throw new Error('Choose a valid date no later than today');
  return day;
}
