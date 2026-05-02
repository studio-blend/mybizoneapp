import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    imageKey: text('image_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('brands_business_id_idx').on(t.businessId),
    nameUnique: unique('brands_business_name_unique').on(t.businessId, t.name),
  }),
);

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
