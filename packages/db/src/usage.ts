import { count, eq, sql } from 'drizzle-orm';
import type { Database } from './index';
import { businesses, products, stores, usageSnapshots, user } from './schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface UsageState {
  plan: string;
  storeCount: number;
  productCount: number;
  userCount: number;
}

/**
 * Returns the current plan and usage counts for a business.
 * Assumes it runs inside withTenant() — RLS filters rows to the active tenant.
 */
export async function getUsage(businessId: string, tx: Tx): Promise<UsageState> {
  const [[biz], [snap]] = await Promise.all([
    tx.select({ plan: businesses.plan }).from(businesses).where(eq(businesses.id, businessId)),
    tx
      .select({
        storeCount: usageSnapshots.storeCount,
        productCount: usageSnapshots.productCount,
        userCount: usageSnapshots.userCount,
      })
      .from(usageSnapshots)
      .where(eq(usageSnapshots.businessId, businessId)),
  ]);

  return {
    plan: biz?.plan ?? 'free',
    storeCount: snap?.storeCount ?? 0,
    productCount: snap?.productCount ?? 0,
    userCount: snap?.userCount ?? 0,
  };
}

/**
 * Full recount from source tables. Use after bulk imports or to repair drift.
 * Runs inside withTenant() — uses explicit WHERE for user table (no RLS).
 */
export async function refreshUsage(businessId: string, tx: Tx): Promise<void> {
  const [[storeRow], [productRow], [userRow]] = await Promise.all([
    tx.select({ n: count() }).from(stores).where(eq(stores.businessId, businessId)),
    tx.select({ n: count() }).from(products).where(eq(products.businessId, businessId)),
    tx.select({ n: count() }).from(user).where(eq(user.businessId, businessId)),
  ]);

  await tx
    .insert(usageSnapshots)
    .values({
      businessId,
      storeCount: storeRow?.n ?? 0,
      productCount: productRow?.n ?? 0,
      userCount: userRow?.n ?? 0,
    })
    .onConflictDoUpdate({
      target: usageSnapshots.businessId,
      set: {
        storeCount: storeRow?.n ?? 0,
        productCount: productRow?.n ?? 0,
        userCount: userRow?.n ?? 0,
        updatedAt: sql`now()`,
      },
    });
}

export interface UsageDeltas {
  storeCount?: 1 | -1;
  productCount?: 1 | -1;
  userCount?: 1 | -1;
}

/**
 * Increment or decrement counters by +1/-1.
 * UPSERT: creates the row on first write, increments on subsequent calls.
 * The EXCLUDED pseudo-table holds the inserted values — adding them achieves
 * the increment effect without a separate SELECT.
 */
export async function bumpUsage(businessId: string, tx: Tx, deltas: UsageDeltas): Promise<void> {
  await tx
    .insert(usageSnapshots)
    .values({
      businessId,
      storeCount: deltas.storeCount ?? 0,
      productCount: deltas.productCount ?? 0,
      userCount: deltas.userCount ?? 0,
    })
    .onConflictDoUpdate({
      target: usageSnapshots.businessId,
      set: {
        storeCount: sql`usage_snapshots.store_count + EXCLUDED.store_count`,
        productCount: sql`usage_snapshots.product_count + EXCLUDED.product_count`,
        userCount: sql`usage_snapshots.user_count + EXCLUDED.user_count`,
        updatedAt: sql`now()`,
      },
    });
}
