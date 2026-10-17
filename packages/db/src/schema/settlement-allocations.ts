import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { purchaseSettlements } from './purchase-settlements';
import { purchases } from './purchases';
import { sales } from './sales';
import { salesSettlements } from './sales-settlements';

const fields = () => ({
  id: uuid('id').primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  settlementId: uuid('settlement_id').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note').notNull(),
  requestHash: text('request_hash').notNull(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const salesSettlementAllocations = pgTable(
  'sales_settlement_allocations',
  {
    ...fields(),
    customerId: uuid('customer_id').notNull(),
    saleId: uuid('sale_id').notNull(),
  },
  (t) => ({
    receipt: foreignKey({
      columns: [t.settlementId, t.businessId, t.customerId],
      foreignColumns: [
        salesSettlements.id,
        salesSettlements.businessId,
        salesSettlements.customerId,
      ],
    }),
    bill: foreignKey({
      columns: [t.saleId, t.businessId, t.customerId],
      foreignColumns: [sales.id, sales.businessId, sales.customerId],
    }),
    amount: check('sales_settlement_allocations_amount_check', sql`${t.amount}>0`),
    note: check(
      'sales_settlement_allocations_note_check',
      sql`length(trim(${t.note})) BETWEEN 3 AND 500`,
    ),
    billIdx: index('sales_settlement_allocations_bill_idx').on(t.businessId, t.saleId),
    receiptIdx: index('sales_settlement_allocations_receipt_idx').on(t.businessId, t.settlementId),
  }),
);
export const purchaseSettlementAllocations = pgTable(
  'purchase_settlement_allocations',
  {
    ...fields(),
    supplierId: uuid('supplier_id').notNull(),
    purchaseId: uuid('purchase_id').notNull(),
  },
  (t) => ({
    payment: foreignKey({
      columns: [t.settlementId, t.businessId, t.supplierId],
      foreignColumns: [
        purchaseSettlements.id,
        purchaseSettlements.businessId,
        purchaseSettlements.supplierId,
      ],
    }),
    bill: foreignKey({
      columns: [t.purchaseId, t.businessId, t.supplierId],
      foreignColumns: [purchases.id, purchases.businessId, purchases.supplierId],
    }),
    amount: check('purchase_settlement_allocations_amount_check', sql`${t.amount}>0`),
    note: check(
      'purchase_settlement_allocations_note_check',
      sql`length(trim(${t.note})) BETWEEN 3 AND 500`,
    ),
    billIdx: index('purchase_settlement_allocations_bill_idx').on(t.businessId, t.purchaseId),
    paymentIdx: index('purchase_settlement_allocations_payment_idx').on(
      t.businessId,
      t.settlementId,
    ),
  }),
);
