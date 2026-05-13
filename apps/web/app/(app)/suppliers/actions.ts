'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, openingBalances, suppliers } from '@mybizone/db';
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

const SupplierInput = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: optionalText(30),
  email: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal('').transform(() => null)),
  gstin: optionalText(20),
  address: optionalText(500),
});

export const createSupplierAction = safeAction(SupplierInput, async (input, { user, tx }) => {
  const [row] = await tx
    .insert(suppliers)
    .values({
      businessId: user.businessId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      address: input.address,
    })
    .returning({ id: suppliers.id, name: suppliers.name });
  if (!row) throw new Error('insert failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'supplier.create',
    entity: 'supplier',
    entityId: row.id,
    after: { name: row.name },
  });

  revalidatePath('/suppliers');
  return { id: row.id, name: row.name };
});

const UpdateSupplierInput = SupplierInput.extend({ id: uuid });

export const updateSupplierAction = safeAction(UpdateSupplierInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({
      name: suppliers.name,
      phone: suppliers.phone,
      email: suppliers.email,
      gstin: suppliers.gstin,
      address: suppliers.address,
    })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.id), eq(suppliers.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  const [row] = await tx
    .update(suppliers)
    .set({
      name: input.name,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      address: input.address,
      updatedAt: new Date(),
    })
    .where(and(eq(suppliers.id, input.id), eq(suppliers.businessId, user.businessId)))
    .returning({ id: suppliers.id, name: suppliers.name });
  if (!row) throw new Error('update failed');

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'supplier.update',
    entity: 'supplier',
    entityId: row.id,
    before,
    after: { name: row.name },
  });

  revalidatePath('/suppliers');
  return { id: row.id, name: row.name };
});

// M8: opening balance per (supplier, FY). UPSERT keyed on the unique tuple.
const SetSupplierOpeningBalanceInput = z.object({
  supplierId: uuid,
  financialYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'expected FY like 2025-26')
    .optional(),
  amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp'),
  notes: z.string().max(500).optional().transform((v) => v?.trim() || null),
});

export const setSupplierOpeningBalanceAction = safeAction(
  SetSupplierOpeningBalanceInput,
  async (input, { user, tx }) => {
    const fy = input.financialYear ?? financialYear(new Date());

    const [supplier] = await tx
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)));
    if (!supplier) throw new Error('supplier not found');

    await tx
      .insert(openingBalances)
      .values({
        businessId: user.businessId,
        entityType: 'supplier',
        entityId: input.supplierId,
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
      action: 'supplier.opening_balance.set',
      entity: 'supplier',
      entityId: input.supplierId,
      after: { fy, amount: input.amount },
    });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${input.supplierId}`);
    return { ok: true, fy, amount: input.amount };
  },
);

const DeleteSupplierInput = z.object({ id: uuid });

export const deleteSupplierAction = safeAction(DeleteSupplierInput, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ name: suppliers.name, outstandingBalance: suppliers.outstandingBalance })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.id), eq(suppliers.businessId, user.businessId)));
  if (!before) throw new Error('not found');

  const balance = Number(before.outstandingBalance ?? 0);
  if (balance > 0) {
    throw new Error(
      `cannot delete supplier with outstanding balance of ₹${balance.toFixed(2)}`,
    );
  }

  await tx
    .delete(suppliers)
    .where(and(eq(suppliers.id, input.id), eq(suppliers.businessId, user.businessId)));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'supplier.delete',
    entity: 'supplier',
    entityId: input.id,
    before: { name: before.name },
  });

  revalidatePath('/suppliers');
  return { ok: true };
});
