import { createHmac, randomUUID } from 'node:crypto';
import { businesses, webhookEvents } from '@mybizone/db';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

const databaseUrl = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';
const secret = 'synthetic-webhook-secret';
vi.mock('@/lib/env', () => ({ env: { RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret' } }));
vi.mock('@/lib/db', async () => {
  if (process.env.DATABASE_URL !== 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test') {
    throw new Error('Run through the isolated release-check helper');
  }
  const { createDb } = await import('@mybizone/db');
  return { db: createDb(process.env.DATABASE_URL) };
});
import { POST } from '@/app/api/webhooks/razorpay/route';
import { db } from '@/lib/db';

describe('synthetic provider events against isolated PostgreSQL', () => {
  const businessIds: string[] = [];
  const eventIds: string[] = [];
  async function fixture() {
    expect(process.env.DATABASE_URL).toBe(databaseUrl);
    const [row] = await db
      .insert(businesses)
      .values({
        name: 'Provider acceptance fixture',
        plan: 'free',
        subscriptionId: `sub_${randomUUID()}`,
      })
      .returning();
    if (!row) throw new Error('Missing fixture');
    businessIds.push(row.id);
    return row;
  }
  function delivery(
    biz: typeof businesses.$inferSelect,
    event: string,
    at: number,
    id = randomUUID(),
    valid = true,
  ) {
    eventIds.push(id);
    const body = JSON.stringify({
      entity: 'event',
      event,
      created_at: at,
      payload: {
        subscription: {
          entity: { id: biz.subscriptionId, status: 'active', notes: { business_id: biz.id } },
        },
      },
    });
    return POST(
      new Request('http://localhost/api/webhooks/razorpay', {
        method: 'POST',
        body,
        headers: {
          'x-razorpay-event-id': id,
          'x-razorpay-signature': valid
            ? createHmac('sha256', secret).update(body).digest('hex')
            : 'invalid',
        },
      }),
    );
  }
  async function plan(id: string) {
    const [row] = await db.select().from(businesses).where(eq(businesses.id, id));
    return row?.plan;
  }
  afterAll(async () => {
    if (eventIds.length)
      await db.delete(webhookEvents).where(inArray(webhookEvents.eventId, eventIds));
    if (businessIds.length) await db.delete(businesses).where(inArray(businesses.id, businessIds));
  });

  it('rejects invalid signatures without recording or granting access', async () => {
    const biz = await fixture();
    const id = randomUUID();
    expect((await delivery(biz, 'subscription.activated', 1000, id, false)).status).toBe(401);
    expect(await plan(biz.id)).toBe('free');
    expect(await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, id))).toHaveLength(
      0,
    );
  });

  it('atomically deduplicates concurrent deliveries, cancels access and ignores older activation', async () => {
    const biz = await fixture();
    const id = randomUUID();
    const results = await Promise.all([
      delivery(biz, 'subscription.activated', 1000, id),
      delivery(biz, 'subscription.activated', 1000, id),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(bodies.filter((r) => r.duplicate)).toHaveLength(1);
    expect(await plan(biz.id)).toBe('pro');
    expect(await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, id))).toHaveLength(
      1,
    );
    expect((await delivery(biz, 'subscription.cancelled', 2000)).status).toBe(200);
    expect(await plan(biz.id)).toBe('free');
    expect(await (await delivery(biz, 'subscription.charged', 1500)).json()).toMatchObject({
      stale: true,
    });
    expect(await plan(biz.id)).toBe('free');
  });

  it('ignores unpaid and unrelated subscription events', async () => {
    const biz = await fixture();
    for (const event of ['payment.failed', 'subscription.authenticated']) {
      expect(await (await delivery(biz, event, 1000)).json()).toMatchObject({ ignored: true });
    }
    expect(
      await (
        await delivery({ ...biz, subscriptionId: 'sub_unrelated' }, 'subscription.activated', 1000)
      ).json(),
    ).toMatchObject({ ignored: true });
    expect(await plan(biz.id)).toBe('free');
  });

  it('returns retryable failure after rollback, then accepts the same event ID', async () => {
    const biz = await fixture();
    const id = randomUUID();
    const transaction = db.transaction.bind(db);
    // Inject failure after the real handler writes, inside the real transaction.
    const spy = vi.spyOn(db, 'transaction').mockImplementationOnce((callback) =>
      transaction(async (tx) => {
        await callback(tx);
        throw new Error('synthetic failure before commit');
      }),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await delivery(biz, 'subscription.activated', 1000, id)).status).toBe(500);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
    expect(await plan(biz.id)).toBe('free');
    expect(await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, id))).toHaveLength(
      0,
    );
    expect((await delivery(biz, 'subscription.activated', 1000, id)).status).toBe(200);
    expect(await plan(biz.id)).toBe('pro');
  });
});
