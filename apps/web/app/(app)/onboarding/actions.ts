'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, businesses } from '@mybizone/db';
import { isValidGstin } from '@mybizone/domain/gst';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const Schema = z
  .object({
    gstEnabled: z.union([z.literal('on'), z.literal('off')]).transform((v) => v === 'on'),
    gstin: z
      .string()
      .max(20)
      .optional()
      .transform((v) => v?.trim().toUpperCase() || null),
  })
  .refine((v) => !v.gstEnabled || (v.gstin && isValidGstin(v.gstin)), {
    path: ['gstin'],
    message: 'GSTIN required and must be valid when GST is enabled',
  });

/** Persist business GST settings as the first onboarding step. */
export const updateBusinessSetupAction = safeAction(Schema, async (input, { user, tx }) => {
  const [before] = await tx
    .select({ gstEnabled: businesses.gstEnabled, gstin: businesses.gstin })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!before) throw new Error('business not found');

  await tx
    .update(businesses)
    .set({
      gstEnabled: input.gstEnabled,
      gstin: input.gstEnabled ? input.gstin : null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, user.businessId));

  await tx.insert(auditLogs).values({
    businessId: user.businessId,
    actorId: user.id,
    action: 'business.setup',
    entity: 'business',
    entityId: user.businessId,
    before,
    after: { gstEnabled: input.gstEnabled, gstin: input.gstEnabled ? input.gstin : null },
  });

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  return { ok: true };
});
