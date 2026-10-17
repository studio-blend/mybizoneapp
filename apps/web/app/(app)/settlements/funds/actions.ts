'use server';
import { executeFundsCommand } from '@/lib/funds-ledger';
import { fundsCommands } from '@/lib/funds-policy';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';
const command = safeAction(
  z.object({
    id: z.string().uuid(),
    side: z.enum(['sales', 'purchases']),
    kind: z.enum(fundsCommands),
    partyId: z.string().uuid().optional(),
    sourceId: z.string().uuid().optional(),
    billId: z.string().uuid().optional(),
    amount: z
      .string()
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
      .optional(),
    method: z.enum(['cash', 'upi', 'card', 'bank', 'cheque', 'other']).optional(),
    reference: z.string().trim().max(100).optional(),
    note: z.string().trim().min(3).max(500),
  }),
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_expenses');
    const result = await executeFundsCommand(tx, user.businessId, user.id, input);
    for (const path of [
      '/settlements',
      '/settlements/funds',
      '/cashbook',
      '/customers',
      '/suppliers',
      '/returns',
      '/purchase-returns',
      '/reports/due-bills',
      '/reports/balance-sheet',
      '/dashboard',
    ])
      revalidatePath(path);
    return result;
  },
);
export async function accountingCommandAction(input: unknown) {
  return command(input);
}
