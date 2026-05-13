import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { products } from './products';

export const damageLogs = pgTable(
  'damage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    // Snapshot of product name at log time in case product is later deleted.
    productName: text('product_name').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 2 }),
    totalValue: numeric('total_value', { precision: 12, scale: 2 }),
    // reason: 'damaged' | 'theft' | 'spillage' | 'expired' | 'other'
    reason: text('reason').notNull(),
    notes: text('notes'),
    loggedBy: text('logged_by').references(() => user.id, { onDelete: 'set null' }),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('damage_logs_business_id_idx').on(t.businessId),
    productIdx: index('damage_logs_product_id_idx').on(t.productId),
    loggedAtIdx: index('damage_logs_logged_at_idx').on(t.businessId, t.loggedAt),
  }),
);

export type DamageLog = typeof damageLogs.$inferSelect;
export type NewDamageLog = typeof damageLogs.$inferInsert;
