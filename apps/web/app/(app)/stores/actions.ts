'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, stores } from '@mybizone/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateStoreSchema = z.object({
  name: z.string().min(1, 'name required').max(120),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
});

export const createStoreAction = safeAction(CreateStoreSchema, async (input, { user, tx }) => {
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

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'store.create',
    entity: 'store',
    entityId: row.id,
    after: { name: row.name },
  });

  revalidatePath('/stores');
  revalidatePath('/dashboard');
  return { id: row.id, name: row.name };
});
