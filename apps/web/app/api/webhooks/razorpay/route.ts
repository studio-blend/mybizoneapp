import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { businesses, webhookEvents } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RazorpaySubscriptionEvent = {
  entity: 'event';
  event: string;
  payload: {
    subscription: {
      entity: {
        id: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
  };
};

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (expected !== signature) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: RazorpaySubscriptionEvent;
  try {
    event = JSON.parse(body) as RazorpaySubscriptionEvent;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // Idempotency: skip if already processed
  const eventId = `${event.event}:${event.payload?.subscription?.entity?.id ?? ''}`;
  try {
    await db.insert(webhookEvents).values({
      provider: 'razorpay',
      eventId,
      eventType: event.event,
    });
  } catch {
    // UNIQUE constraint violation — duplicate delivery, return 200 immediately
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const sub = event.payload?.subscription?.entity;
  const businessId = sub?.notes?.business_id;

  if (!businessId) {
    console.warn('[webhook/razorpay] no business_id in notes for event', event.event);
    return NextResponse.json({ ok: true });
  }

  try {
    if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
      await db.update(businesses).set({ plan: 'pro', updatedAt: new Date() }).where(eq(businesses.id, businessId));
    } else if (event.event === 'subscription.cancelled' || event.event === 'subscription.completed') {
      await db.update(businesses).set({ plan: 'free', updatedAt: new Date() }).where(eq(businesses.id, businessId));
    }
  } catch (err) {
    console.error('[webhook/razorpay] db update failed', err);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
