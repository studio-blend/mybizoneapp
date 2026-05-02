import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  vertical: text('vertical').notNull().default('retail'), // 'retail' | 'restaurant' (v3) | 'service' (v3)
  gstin: text('gstin'),
  gstEnabled: boolean('gst_enabled').notNull().default(false),
  currency: text('currency').notNull().default('INR'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('active'), // active | suspended | deleted
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
