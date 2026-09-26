import { db } from '@/lib/db';
import { env } from '@/lib/env';
import {
  SubscriptionEvent,
  shouldApplySubscriptionEvent,
  subscriptionChange,
  validWebhookSignature,
} from '@/lib/subscription-events';
import { businesses, webhookEvents } from '@mybizone/db';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const body = await req.text();
  if (
    !validWebhookSignature(
      body,
      req.headers.get('x-razorpay-signature') ?? '',
      env.RAZORPAY_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const eventId = req.headers.get('x-razorpay-event-id');
  if (!eventId || eventId.length > 200) {
    return NextResponse.json({ error: 'missing or invalid event ID' }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const eventName = typeof raw === 'object' && raw !== null && 'event' in raw ? raw.event : null;
  const change = typeof eventName === 'string' ? subscriptionChange(eventName) : null;
  if (!change) return NextResponse.json({ ok: true, ignored: true });
  const parsed = SubscriptionEvent.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid event' }, { status: 400 });
  const event = parsed.data;
  const sub = event.payload.subscription.entity;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.business_id', ${sub.notes.business_id}, true)`);
      // The deduplication record and entitlement change must commit together.
      const inserted = await tx
        .insert(webhookEvents)
        .values({
          provider: 'razorpay',
          eventId,
          eventType: event.event,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (!inserted.length) return { duplicate: true };
      const [biz] = await tx
        .select()
        .from(businesses)
        .where(eq(businesses.id, sub.notes.business_id))
        .for('update');
      if (!biz || biz.subscriptionId !== sub.id) return { ignored: true };
      const at = new Date(event.created_at * 1000);
      if (
        !shouldApplySubscriptionEvent(
          biz.subscriptionEventAt,
          biz.subscriptionStatus,
          at,
          change.status,
        )
      ) {
        return { stale: true };
      }
      await tx
        .update(businesses)
        .set({
          plan: change.plan,
          subscriptionStatus: change.status,
          subscriptionEventAt: at,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, biz.id));
      return {};
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[webhook/razorpay] processing failed', err);
    return NextResponse.json({ error: 'processing failed; retry delivery' }, { status: 500 });
  }
}
