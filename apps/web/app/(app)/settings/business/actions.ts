'use server';
import { BusinessProfileSettingsSchema } from '@/lib/business-profile-schema';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { auditLogs, businesses } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export const updateBusinessProfileAction = safeAction(
  BusinessProfileSettingsSchema,
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_settings');
    const [before] = await tx
      .select({
        businessProfile: businesses.businessProfile,
        sellingModel: businesses.sellingModel,
      })
      .from(businesses)
      .where(eq(businesses.id, user.businessId))
      .for('update');
    if (!before) throw new Error('Business not found');
    await tx
      .update(businesses)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(businesses.id, user.businessId));
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'business.profile.update',
      entity: 'business',
      entityId: user.businessId,
      before,
      after: input,
    });
    revalidatePath('/settings/business');
    revalidatePath('/stores');
    revalidatePath('/dashboard');
    return { ok: true };
  },
);
