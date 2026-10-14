import { loadDashboardData } from '@/lib/dashboard-data';
import { businesses, createDb } from '@mybizone/db';
import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';

const url = 'postgresql://postgres@127.0.0.1:55432/mybizone_release_test';

test.skipIf(process.env.DATABASE_URL !== url)(
  'dashboard aggregate date parameters work with real PostgreSQL',
  async () => {
    const db = createDb(url);
    const [business] = await db
      .insert(businesses)
      .values({ name: 'Dashboard date regression' })
      .returning();
    if (!business) throw new Error('Fixture creation failed');
    try {
      const result = await loadDashboardData(db, business.id, new Date('2026-10-14T12:00:00Z'));
      expect(result).toMatchObject({ revThis: 0, revPrev: 0, expThis: 0, expPrev: 0, custNew: 0 });
    } finally {
      try {
        await db.delete(businesses).where(eq(businesses.id, business.id));
      } finally {
        await db.$client.end({ timeout: 5 });
      }
    }
  },
);
