import { integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

// Atomic per-tenant bill number counters, scoped to doc_type + financial_year.
// financialYear format: '2025-26' (April→March Indian FY).
// UPDATE ... SET last_seq = last_seq + 1 RETURNING last_seq is the lock-free path.
// One row per (business, doc_type, financial_year) combination.
export const billSeries = pgTable(
  'bill_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // docType: 'sale' | 'invoice' | 'quotation' | 'dc' | 'return'
    docType: text('doc_type').notNull(),
    // financialYear: '2025-26'
    financialYear: text('financial_year').notNull(),
    // prefix: e.g. 'GST', 'QT', 'DC', 'RET' — used to build the bill number string
    prefix: text('prefix').notNull().default('GST'),
    lastSeq: integer('last_seq').notNull().default(0),
  },
  (t) => ({
    uniqueSeries: unique('bill_series_unique').on(t.businessId, t.docType, t.financialYear),
  }),
);

export type BillSeries = typeof billSeries.$inferSelect;
export type NewBillSeries = typeof billSeries.$inferInsert;
