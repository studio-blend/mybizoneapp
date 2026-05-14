import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const customerTags = pgTable(
  'customer_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    uniq: unique('customer_tags_uniq').on(t.businessId, t.customerId, t.tag),
  }),
);

export type CustomerTag = typeof customerTags.$inferSelect;
export type NewCustomerTag = typeof customerTags.$inferInsert;

export const customerNotes = pgTable('customer_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id').notNull(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type CustomerNote = typeof customerNotes.$inferSelect;
export type NewCustomerNote = typeof customerNotes.$inferInsert;
