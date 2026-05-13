import { index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

// M8: opening balance per (entity, financial year). UPSERT keyed on the unique tuple.
// entity_type: 'customer' | 'supplier'. entity_id is the customers.id or suppliers.id
// — NOT a FK because both entity tables share this single ledger row.
// One row per (business, entity_type, entity_id, financial_year).
export const openingBalances = pgTable(
  'opening_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // entityType: 'customer' | 'supplier'
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    // financialYear: '2025-26'
    financialYear: text('financial_year').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('opening_balances_business_id_idx').on(t.businessId),
    entityIdx: index('opening_balances_entity_idx').on(t.businessId, t.entityType, t.entityId),
    uniqueRow: unique('opening_balances_unique').on(
      t.businessId,
      t.entityType,
      t.entityId,
      t.financialYear,
    ),
  }),
);

export type OpeningBalance = typeof openingBalances.$inferSelect;
export type NewOpeningBalance = typeof openingBalances.$inferInsert;
