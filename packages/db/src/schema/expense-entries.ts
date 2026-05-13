import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';

// An expense_entry is a single income or expense line in the business ledger.
// type='income' means money coming in outside of sales (e.g. interest, refunds);
// type='expense' means any business spend (rent, salaries, utilities, etc.).
// Categories are free-text per-business so each shop can tailor its chart.
export const expenseEntries = pgTable(
  'expense_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // type: 'income' | 'expense'
    type: text('type').notNull(),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    description: text('description').notNull(),
    // paymentMethod: 'cash' | 'upi' | 'card' | 'cheque' | 'bank' | 'other'
    paymentMethod: text('payment_method').notNull().default('cash'),
    referenceNo: text('reference_no'),
    notes: text('notes'),
    entryDate: timestamp('entry_date', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('expense_entries_business_id_idx').on(t.businessId),
    businessEntryDateIdx: index('expense_entries_business_entry_date_idx').on(t.businessId, t.entryDate),
    businessTypeIdx: index('expense_entries_business_type_idx').on(t.businessId, t.type),
  }),
);

export type ExpenseEntry = typeof expenseEntries.$inferSelect;
export type NewExpenseEntry = typeof expenseEntries.$inferInsert;
