import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export type CategoryAttribute = { name: string; unit?: string };
import { businesses } from './businesses';
import { stores } from './stores';

// Categories support sub-categories via self-referencing parent_id.
// Scope: per-business; optionally narrowed to a single store. NULL store_id = applies to all stores.
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    // User-defined dimension specs for this category, e.g. [{name:"Capacity",unit:"Ton"}]
    attributes: jsonb('attributes').$type<CategoryAttribute[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('categories_business_id_idx').on(t.businessId),
    parentIdx: index('categories_parent_id_idx').on(t.parentId),
    nameUnique: unique('categories_business_parent_name_unique').on(
      t.businessId,
      t.parentId,
      t.name,
    ),
  }),
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
