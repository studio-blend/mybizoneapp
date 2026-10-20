'use server';
import { executeMoneyCommand } from '@/lib/money-ledger';
import { moneyCommandSchema } from '@/lib/money-policy';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { revalidatePath } from 'next/cache';
const command = safeAction(moneyCommandSchema, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_expenses');
  const result = await executeMoneyCommand(tx, user.businessId, user.id, input);
  for (const path of ['/money', '/dashboard', '/cashbook', '/reports/credit-ageing'])
    revalidatePath(path);
  return result;
});
export async function moneyCommandAction(input: unknown) {
  return command(input);
}
