import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { customers } from './customers';

// A sales settlement records a payment received from a customer against
// their outstanding balance. Does NOT link to a specific invoice —
// it reduces the customer's total outstanding_balance.
export const salesSettlements = pgTable(
  'sales_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    // paymentMethod: 'cash' | 'upi' | 'card' | 'cheque' | 'other'
    paymentMethod: text('payment_method').notNull(),
    referenceNo: text('reference_no'), // cheque no / UPI ref / card last4
    notes: text('notes'),
    settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('sales_settlements_business_id_idx').on(t.businessId),
    customerIdx: index('sales_settlements_customer_id_idx').on(t.customerId),
    settledAtIdx: index('sales_settlements_settled_at_idx').on(t.businessId, t.settledAt),
  }),
);

export type SalesSettlement = typeof salesSettlements.$inferSelect;
export type NewSalesSettlement = typeof salesSettlements.$inferInsert;
