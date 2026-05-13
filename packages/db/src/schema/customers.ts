import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    gstin: text('gstin'),
    address: text('address'),
    // rate_category links customer to a price tier on products.
    // 'retail' = products.price, 'wholesale' = products.wholesale_price,
    // 'mrp' = products.mrp, 'rate1'..'rate4' = products.rate_1..rate_4
    rateCategory: text('rate_category').notNull().default('retail'),
    creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
    // outstandingBalance is the running sum of unpaid bills minus settlements.
    // Updated transactionally on each sale + settlement.
    outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('customers_business_id_idx').on(t.businessId),
    businessNameIdx: index('customers_business_name_idx').on(t.businessId, t.name),
    phoneIdx: index('customers_phone_idx').on(t.businessId, t.phone),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
