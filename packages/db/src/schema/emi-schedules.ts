import { date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { customers } from './customers';
import { sales } from './sales';

// M8: EMI schedule — one row per finance/instalment plan attached (optionally) to a sale.
// finance_company is captured as free-text so businesses can add new financiers without a migration.
// status transitions: 'active' → 'completed' (all instalments paid) | 'defaulted' (manual).
export const emiSchedules = pgTable(
  'emi_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    financeCompany: text('finance_company').notNull(),
    principalAmount: numeric('principal_amount', { precision: 12, scale: 2 }).notNull(),
    downPayment: numeric('down_payment', { precision: 12, scale: 2 }).notNull().default('0'),
    tenureMonths: integer('tenure_months').notNull(),
    emiAmount: numeric('emi_amount', { precision: 12, scale: 2 }).notNull(),
    interestRate: numeric('interest_rate', { precision: 5, scale: 2 }),
    startDate: date('start_date').notNull(),
    // status: 'active' | 'completed' | 'defaulted'
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('emi_schedules_business_id_idx').on(t.businessId),
    saleIdx: index('emi_schedules_sale_id_idx').on(t.saleId),
    customerIdx: index('emi_schedules_customer_id_idx').on(t.customerId),
  }),
);

// One row per scheduled instalment. Generated upfront when the schedule is created.
// status: 'pending' (due date in future) | 'overdue' (past due, unpaid) | 'paid'.
// Overdue is a derived state computed at query time — we only persist 'pending' vs 'paid'.
export const emiPayments = pgTable(
  'emi_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    emiScheduleId: uuid('emi_schedule_id')
      .notNull()
      .references(() => emiSchedules.id, { onDelete: 'cascade' }),
    instalmentNumber: integer('instalment_number').notNull(),
    dueDate: date('due_date').notNull(),
    paidDate: date('paid_date'),
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }),
    paymentMethod: text('payment_method'),
    // status: 'pending' | 'paid'
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('emi_payments_business_id_idx').on(t.businessId),
    scheduleIdx: index('emi_payments_schedule_id_idx').on(t.emiScheduleId),
    businessDueIdx: index('emi_payments_business_due_date_idx').on(t.businessId, t.dueDate),
  }),
);

export type EmiSchedule = typeof emiSchedules.$inferSelect;
export type NewEmiSchedule = typeof emiSchedules.$inferInsert;
export type EmiPayment = typeof emiPayments.$inferSelect;
export type NewEmiPayment = typeof emiPayments.$inferInsert;
