import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod/v3';

export const SubscriptionEvent = z.object({
  entity: z.literal('event'),
  event: z.string().min(1),
  created_at: z.number().int().positive(),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string().min(1),
        status: z.string(),
        notes: z.object({ business_id: z.string().uuid() }).passthrough(),
      }),
    }),
  }),
});

export function validWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function subscriptionChange(event: string): { plan: 'free' | 'pro'; status: string } | null {
  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      return { plan: 'pro', status: 'active' };
    case 'subscription.cancelled':
      return { plan: 'free', status: 'cancelled' };
    case 'subscription.completed':
      return { plan: 'free', status: 'completed' };
    case 'subscription.halted':
      return { plan: 'free', status: 'halted' };
    case 'subscription.paused':
      return { plan: 'free', status: 'paused' };
    default:
      return null;
  }
}

export function shouldApplySubscriptionEvent(
  previousAt: Date | null,
  previousStatus: string | null,
  nextAt: Date,
  nextStatus: string,
): boolean {
  if (!previousAt) return true;
  if (nextAt < previousAt) return false;
  // Provider timestamps have second precision. A terminal state wins a tie.
  if (nextAt.getTime() === previousAt.getTime()) {
    const terminal = ['cancelled', 'completed', 'halted', 'paused'];
    if (terminal.includes(previousStatus ?? '') && !terminal.includes(nextStatus)) return false;
  }
  return true;
}
