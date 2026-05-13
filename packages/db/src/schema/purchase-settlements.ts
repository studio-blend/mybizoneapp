import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { suppliers } from './suppliers';

export const purchaseSettlements = pgTable(
  'purchase_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(),
    referenceNo: text('reference_no'),
    notes: text('notes'),
    settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('purchase_settlements_business_id_idx').on(t.businessId),
    supplierIdx: index('purchase_settlements_supplier_id_idx').on(t.supplierId),
    settledAtIdx: index('purchase_settlements_settled_at_idx').on(t.businessId, t.settledAt),
  }),
);

export type PurchaseSettlement = typeof purchaseSettlements.$inferSelect;
export type NewPurchaseSettlement = typeof purchaseSettlements.$inferInsert;
