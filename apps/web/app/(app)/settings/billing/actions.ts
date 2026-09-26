'use server';

import { env } from '@/lib/env';
import { getRazorpay, isBillingEnabled } from '@/lib/razorpay';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { businesses } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v3';

const CreateSubSchema = z.object({
  interval: z.enum(['monthly', 'annual']),
});

export const createSubscriptionAction = safeAction(CreateSubSchema, async (input, { user, tx }) => {
  await requirePermission(user, 'manage_billing');
  if (!isBillingEnabled()) {
    throw new Error('Billing not configured on this deployment');
  }

  const planId =
    input.interval === 'annual' ? env.RAZORPAY_PLAN_ID_ANNUAL : env.RAZORPAY_PLAN_ID_MONTHLY;

  if (!planId) {
    throw new Error(`Razorpay plan ID not configured for ${input.interval}`);
  }

  const rzp = getRazorpay();
  const [business] = await tx
    .select()
    .from(businesses)
    .where(eq(businesses.id, user.businessId))
    .for('update');
  if (!business) throw new Error('Business not found');
  if (business.plan === 'pro') throw new Error('Your Pro plan is already active');
  // Reuse an unfinished checkout rather than create multiple billable mandates.
  if (business.subscriptionId) {
    const existing = await rzp.subscriptions.fetch(business.subscriptionId);
    if (['created', 'authenticated'].includes(existing.status)) {
      if (existing.plan_id !== planId) {
        throw new Error(
          'A checkout for another billing interval is already open. Finish or cancel it before changing plans.',
        );
      }
      return { subscriptionId: existing.id, keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID };
    }
    if (!['cancelled', 'completed', 'expired'].includes(existing.status)) {
      throw new Error(
        'A subscription already exists. Wait for confirmation or contact your account administrator.',
      );
    }
  }
  const sub = await rzp.subscriptions.create({
    plan_id: planId,
    total_count: input.interval === 'annual' ? 10 : 120,
    quantity: 1,
    customer_notify: 1,
    notes: {
      business_id: user.businessId,
      interval: input.interval,
    },
  });

  await tx
    .update(businesses)
    .set({
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      subscriptionEventAt: null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, user.businessId));

  return {
    subscriptionId: sub.id,
    keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  };
});
