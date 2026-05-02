import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

// Per-tenant atomic counters for sale bill numbers and invoice numbers.
// UPDATE ... SET last_x = last_x + 1 RETURNING is the lock-free path used by
// the POS Server Action.
export const billCounters = pgTable('bill_counters', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  lastSaleNo: integer('last_sale_no').notNull().default(0),
  lastInvoiceNo: integer('last_invoice_no').notNull().default(0),
});

export type BillCounter = typeof billCounters.$inferSelect;
