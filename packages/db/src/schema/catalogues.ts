import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { brands } from './brands';
import { businesses } from './businesses';
import { stores } from './stores';

// Catalogue PDFs uploaded by admin — viewable by employees in-browser.
// file_key is the storage path (e.g. `catalogues/<businessId>/<uuid>.pdf`).
export const catalogues = pgTable(
  'catalogues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    fileKey: text('file_key').notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('catalogues_business_id_idx').on(t.businessId),
    brandIdx: index('catalogues_brand_id_idx').on(t.brandId),
  }),
);

export type Catalogue = typeof catalogues.$inferSelect;
export type NewCatalogue = typeof catalogues.$inferInsert;
