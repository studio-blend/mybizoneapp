import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    // gstin is the supplier's GST registration number, needed for GST input credit.
    gstin: text('gstin'),
    address: text('address'),
    // outstandingBalance tracks what the business owes this supplier.
    // Increases on purchase bills, decreases on purchase settlements.
    outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('suppliers_business_id_idx').on(t.businessId),
    businessNameIdx: index('suppliers_business_name_idx').on(t.businessId, t.name),
  }),
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
