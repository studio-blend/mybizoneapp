'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, customers, openingBalances } from '@mybizone/db';
import { financialYear } from '@mybizone/domain/bill-series';
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

const CustomerInput = z.object({
  name: z.string().min(1, 'Name required').max(200),
  phone: optionalText(30),
  email: z
    .string()
    .email()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => null)),
  gstin: optionalText(20),
  address: optionalText(500),
  rateCategory: z
    .enum(['retail', 'wholesale', 'mrp', 'dealer', 'rate1', 'rate2', 'rate3', 'rate4'])
    .default('retail'),
  creditLimit: z
    .string()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Invalid credit limit')
    .default('0'),
});

export const createCustomerAction = safeAction(CustomerInput, async (input, { user, tx }) => {
  const [row] = await tx
    .insert(customers)
    .values({
      businessId: user.businessId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      address: input.address ?? null,
      rateCategory: input.rateCategory,
      creditLimit: input.creditLimit,
    })
    .returning({ id: customers.id, name: customers.name });
  if (!row) throw new Error('insert failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'customer.create',
    entity: 'customer',
    entityId: row.id,
    after: { name: row.name },
  });

  revalidatePath('/customers');
  return { id: row.id, name: row.name };
});

const UpdateCustomerInput = CustomerInput.extend({ id: uuid });

export const updateCustomerAction = safeAction(
  UpdateCustomerInput,
  async (input, { user, tx }) => {
    const [before] = await tx
      .select({
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        gstin: customers.gstin,
        address: customers.address,
        rateCategory: customers.rateCategory,
        creditLimit: customers.creditLimit,
      })
      .from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.businessId, user.businessId)));
    if (!before) throw new Error('not found');

    const [row] = await tx
      .update(customers)
      .set({
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gstin: input.gstin ?? null,
        address: input.address ?? null,
        rateCategory: input.rateCategory,
        creditLimit: input.creditLimit,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, input.id), eq(customers.businessId, user.businessId)))
      .returning({ id: customers.id, name: customers.name });
    if (!row) throw new Error('update failed');

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'customer.update',
      entity: 'customer',
      entityId: row.id,
      before,
      after: { name: row.name },
    });

    revalidatePath('/customers');
    return { id: row.id, name: row.name };
  },
);

// M8: opening balance per (customer, FY). UPSERT keyed on the unique tuple.
const SetOpeningBalanceInput = z.object({
  customerId: uuid,
  financialYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'expected FY like 2025-26')
    .optional(),
  amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp'),
  notes: z.string().max(500).optional().transform((v) => v?.trim() || null),
});

export const setCustomerOpeningBalanceAction = safeAction(
  SetOpeningBalanceInput,
  async (input, { user, tx }) => {
    const fy = input.financialYear ?? financialYear(new Date());

    // Ensure the customer belongs to this tenant.
    const [customer] = await tx
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
    if (!customer) throw new Error('customer not found');

    await tx
      .insert(openingBalances)
      .values({
        businessId: user.businessId,
        entityType: 'customer',
        entityId: input.customerId,
        financialYear: fy,
        amount: input.amount,
        notes: input.notes,
      })
      .onConflictDoUpdate({
        target: [
          openingBalances.businessId,
          openingBalances.entityType,
          openingBalances.entityId,
          openingBalances.financialYear,
        ],
        set: { amount: input.amount, notes: input.notes },
      });

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'customer.opening_balance.set',
      entity: 'customer',
      entityId: input.customerId,
      after: { fy, amount: input.amount },
    });

    revalidatePath('/customers');
    revalidatePath(`/customers/${input.customerId}`);
    return { ok: true, fy, amount: input.amount };
  },
);

const DeleteCustomerInput = z.object({ id: uuid });

export const deleteCustomerAction = safeAction(
  DeleteCustomerInput,
  async (input, { user, tx }) => {
    const [before] = await tx
      .select({ name: customers.name, outstandingBalance: customers.outstandingBalance })
      .from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.businessId, user.businessId)));
    if (!before) throw new Error('not found');

    if (parseFloat(before.outstandingBalance) !== 0) {
      throw new Error(
        `cannot delete customer with outstanding balance of ₹${before.outstandingBalance}`,
      );
    }

    await tx
      .delete(customers)
      .where(and(eq(customers.id, input.id), eq(customers.businessId, user.businessId)));

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'customer.delete',
      entity: 'customer',
      entityId: input.id,
      before: { name: before.name },
    });

    revalidatePath('/customers');
    return { ok: true };
  },
);
