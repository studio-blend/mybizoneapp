import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SubscriptionEvent,
  shouldApplySubscriptionEvent,
  subscriptionChange,
  validWebhookSignature,
} from '../../lib/subscription-events';

describe('subscription webhook integrity', () => {
  const body = '{"event":"subscription.charged"}';
  const secret = 'test-secret';
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  it('requires the signature of the exact raw body', () => {
    expect(validWebhookSignature(body, signature, secret)).toBe(true);
    expect(validWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(validWebhookSignature(body, signature, 'other')).toBe(false);
  });
  it('rejects malformed signatures without throwing', () => {
    for (const value of ['', 'zz'.repeat(32), 'ab', 'a'.repeat(65)]) {
      expect(validWebhookSignature(body, value, secret)).toBe(false);
    }
    expect(validWebhookSignature(body, signature, '')).toBe(false);
  });
  it('does not grant Pro for an authenticated but unpaid subscription', () => {
    expect(subscriptionChange('subscription.authenticated')).toBeNull();
    expect(subscriptionChange('payment.failed')).toBeNull();
    expect(subscriptionChange('subscription.activated')?.plan).toBe('pro');
  });
  it('removes access for cancelled or halted subscriptions', () => {
    expect(subscriptionChange('subscription.cancelled')?.plan).toBe('free');
    expect(subscriptionChange('subscription.halted')?.plan).toBe('free');
  });
  it('prevents an older paid notification from undoing cancellation', () => {
    expect(
      shouldApplySubscriptionEvent(new Date(2000), 'cancelled', new Date(1000), 'active'),
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent(new Date(2000), 'cancelled', new Date(2000), 'active'),
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent(new Date(2000), 'active', new Date(2000), 'cancelled'),
    ).toBe(true);
  });
  it('permits a later resume after a pause', () => {
    expect(shouldApplySubscriptionEvent(new Date(1000), 'paused', new Date(2000), 'active')).toBe(
      true,
    );
  });
  it('requires a timestamp, subscription ID and valid business ID', () => {
    expect(
      SubscriptionEvent.safeParse({ entity: 'event', event: 'subscription.charged' }).success,
    ).toBe(false);
    expect(
      SubscriptionEvent.safeParse({
        entity: 'event',
        event: 'subscription.charged',
        created_at: 1234567890,
        payload: {
          subscription: {
            entity: { id: 'sub_test', status: 'active', notes: { business_id: 'not-a-uuid' } },
          },
        },
      }).success,
    ).toBe(false);
  });
});
