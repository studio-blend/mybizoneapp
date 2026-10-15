import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    vertical: text('vertical').notNull().default('retail'), // 'retail' | 'restaurant' (v3) | 'service' (v3)
    businessProfile: text('business_profile').notNull().default('general_retail'),
    sellingModel: text('selling_model').notNull().default('retail'),
    gstin: text('gstin'),
    gstEnabled: boolean('gst_enabled').notNull().default(false),
    currency: text('currency').notNull().default('INR'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    plan: text('plan').notNull().default('free'),
    subscriptionId: text('subscription_id'),
    subscriptionStatus: text('subscription_status'),
    subscriptionEventAt: timestamp('subscription_event_at', { withTimezone: true }),
    status: text('status').notNull().default('active'), // active | suspended | deleted
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileValid: check(
      'businesses_business_profile_check',
      sql`${t.businessProfile} IN ('general_retail','grocery','furniture','electronics','wholesale','food_service')`,
    ),
    sellingModelValid: check(
      'businesses_selling_model_check',
      sql`${t.sellingModel} IN ('retail','wholesale','both')`,
    ),
  }),
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
