'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, bumpUsage, businesses, stores } from '@mybizone/db';
import { type Plan, checkLimit, isValidPlan } from '@mybizone/domain/plans';
import { count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateStoreSchema = z.object({
  name: z.string().min(1, 'name required').max(120),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
});

export const createStoreAction = safeAction(CreateStoreSchema, async (input, { user, tx }) => {
  const [bizRows, countRows] = await Promise.all([
    tx.select({ plan: businesses.plan }).from(businesses).where(eq(businesses.id, user.businessId)),
    tx.select({ n: count() }).from(stores).where(eq(stores.businessId, user.businessId)),
  ]);
  const plan: Plan = isValidPlan(bizRows[0]?.plan) ? (bizRows[0].plan as Plan) : 'free';
  const gate = checkLimit(plan, 'stores', countRows[0]?.n ?? 0);
  if (!gate.allowed) {
    throw new Error(`upgrade required: store limit of ${gate.limit} reached on the free plan`);
  }

  const [row] = await tx
    .insert(stores)
    .values({
      businessId: user.businessId,
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
    })
    .returning({ id: stores.id, name: stores.name });
  if (!row) throw new Error('insert failed');

  await Promise.all([
    tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'store.create',
      entity: 'store',
      entityId: row.id,
      after: { name: row.name },
    }),
    bumpUsage(user.businessId, tx, { storeCount: 1 }),
  ]);

  revalidatePath('/stores');
  revalidatePath('/dashboard');
  return { id: row.id, name: row.name };
});
