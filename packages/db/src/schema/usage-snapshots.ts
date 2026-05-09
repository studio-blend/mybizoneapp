import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const usageSnapshots = pgTable('usage_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  storeCount: integer('store_count').notNull().default(0),
  productCount: integer('product_count').notNull().default(0),
  userCount: integer('user_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UsageSnapshot = typeof usageSnapshots.$inferSelect;
