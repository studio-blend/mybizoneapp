import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    phone: text('phone'),
    // Null inherits the business default independently for each setting.
    businessProfile: text('business_profile'),
    sellingModel: text('selling_model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('stores_business_id_idx').on(t.businessId),
    profileValid: check(
      'stores_business_profile_check',
      sql`${t.businessProfile} IN ('general_retail','grocery','furniture','electronics','wholesale','food_service')`,
    ),
    sellingModelValid: check(
      'stores_selling_model_check',
      sql`${t.sellingModel} IN ('retail','wholesale','both')`,
    ),
  }),
);

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
