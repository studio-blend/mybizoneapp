'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, expenseEntries } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected amount up to 2dp');

const ENTRY_TYPES = ['income', 'expense'] as const;
const PAYMENT_METHODS = ['cash', 'upi', 'card', 'cheque', 'other'] as const;

const CreateExpenseEntryInput = z.object({
  type: z.enum(ENTRY_TYPES),
  category: z.string().min(1).max(60).transform((v) => v.trim()),
  amount: moneyText,
  description: z.string().min(1).max(200).transform((v) => v.trim()),
  paymentMethod: z.enum(PAYMENT_METHODS),
  referenceNo: optionalText(100),
  notes: optionalText(500),
  entryDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});

export const createExpenseEntryAction = safeAction(
  CreateExpenseEntryInput,
  async (input, { user, tx }) => {
    const [row] = await tx
      .insert(expenseEntries)
      .values({
        businessId: user.businessId,
        type: input.type,
        category: input.category,
        amount: input.amount,
        description: input.description,
        paymentMethod: input.paymentMethod,
        referenceNo: input.referenceNo,
        notes: input.notes,
        entryDate: input.entryDate,
        createdBy: user.id,
      })
      .returning({ id: expenseEntries.id });
    if (!row) throw new Error('expense entry insert failed');

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'expense.create',
      entity: 'expense_entry',
      entityId: row.id,
      after: {
        type: input.type,
        category: input.category,
        amount: input.amount,
        description: input.description,
        paymentMethod: input.paymentMethod,
      },
    });

    revalidatePath('/expenses');
    return { id: row.id };
  },
);

const DeleteExpenseEntryInput = z.object({
  id: uuid,
});

export const deleteExpenseEntryAction = safeAction(
  DeleteExpenseEntryInput,
  async (input, { user, tx }) => {
    const deleted = await tx
      .delete(expenseEntries)
      .where(
        and(
          eq(expenseEntries.id, input.id),
          eq(expenseEntries.businessId, user.businessId),
        ),
      )
      .returning({ id: expenseEntries.id });

    if (deleted.length === 0) throw new Error('expense entry not found');

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'expense.delete',
      entity: 'expense_entry',
      entityId: input.id,
    });

    revalidatePath('/expenses');
    return { ok: true };
  },
);
