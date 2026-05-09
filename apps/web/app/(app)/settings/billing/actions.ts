'use server';

import { env } from '@/lib/env';
import { getRazorpay, isBillingEnabled } from '@/lib/razorpay';
import { safeAction } from '@/lib/server-action';
import { z } from 'zod';

const CreateSubSchema = z.object({
  interval: z.enum(['monthly', 'annual']),
});

export const createSubscriptionAction = safeAction(
  CreateSubSchema,
  async (input, { user }) => {
    if (!isBillingEnabled()) {
      throw new Error('Billing not configured on this deployment');
    }

    const planId =
      input.interval === 'annual'
        ? env.RAZORPAY_PLAN_ID_ANNUAL
        : env.RAZORPAY_PLAN_ID_MONTHLY;

    if (!planId) {
      throw new Error(`Razorpay plan ID not configured for ${input.interval}`);
    }

    const rzp = getRazorpay();
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

    return {
      subscriptionId: sub.id,
      keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    };
  },
);
