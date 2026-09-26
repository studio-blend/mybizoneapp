'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { customerNotes, customerTags, customers } from '@mybizone/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();

// ── Tags ─────────────────────────────────────────────────────────────────────

const AddTagInput = z.object({
  customerId: uuid,
  tag: z.string().min(1).max(50),
});

export const addCustomerTagAction = safeAction(AddTagInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_customers');
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
  if (!customer) throw new Error('customer not found');

  await tx
    .insert(customerTags)
    .values({
      businessId: user.businessId,
      customerId: input.customerId,
      tag: input.tag.trim(),
    })
    .onConflictDoNothing();
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
});

const RemoveTagInput = z.object({
  tagId: uuid,
  customerId: uuid,
});

export const removeCustomerTagAction = safeAction(RemoveTagInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_customers');
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
  if (!customer) throw new Error('customer not found');

  await tx
    .delete(customerTags)
    .where(
      and(
        eq(customerTags.id, input.tagId),
        eq(customerTags.customerId, input.customerId),
        eq(customerTags.businessId, user.businessId),
      ),
    );
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
});

// ── Notes ─────────────────────────────────────────────────────────────────────

const AddNoteInput = z.object({
  customerId: uuid,
  note: z.string().min(1).max(2000),
});

export const addCustomerNoteAction = safeAction(AddNoteInput, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_customers');
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));
  if (!customer) throw new Error('customer not found');

  await tx.insert(customerNotes).values({
    businessId: user.businessId,
    customerId: input.customerId,
    note: input.note.trim(),
    createdBy: user.id,
  });
  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true };
});
