'use server';

import { BusinessProfileSchema, SellingModelSchema } from '@/lib/business-profile-schema';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { auditLogs, businesses } from '@mybizone/db';
import { isValidGstin } from '@mybizone/domain/gst';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const Schema = z
  .object({
    businessProfile: BusinessProfileSchema.default('general_retail'),
    sellingModel: SellingModelSchema.default('retail'),
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
  await requirePermission(user, 'manage_settings');
  const [before] = await tx
    .select({
      gstEnabled: businesses.gstEnabled,
      gstin: businesses.gstin,
      businessProfile: businesses.businessProfile,
      sellingModel: businesses.sellingModel,
    })
    .from(businesses)
    .where(eq(businesses.id, user.businessId));
  if (!before) throw new Error('business not found');

  await tx
    .update(businesses)
    .set({
      gstEnabled: input.gstEnabled,
      businessProfile: input.businessProfile,
      sellingModel: input.sellingModel,
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
    after: {
      gstEnabled: input.gstEnabled,
      gstin: input.gstEnabled ? input.gstin : null,
      businessProfile: input.businessProfile,
      sellingModel: input.sellingModel,
    },
  });

  revalidatePath('/onboarding');
  revalidatePath('/dashboard');
  return { ok: true };
});
