import { sql } from 'drizzle-orm';
import { check } from 'drizzle-orm/pg-core';
import { index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { customers } from './customers';
import { products } from './products';
import { sales } from './sales';

export const salesReturns = pgTable(
  'sales_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    originalSaleId: uuid('original_sale_id').references(() => sales.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerName: text('customer_name'),
    returnNo: text('return_no').notNull(),
    reason: text('reason'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    debtReductionAmount: numeric('debt_reduction_amount', { precision: 12, scale: 2 }),
    refundDueAmount: numeric('refund_due_amount', { precision: 12, scale: 2 }),
    requestHash: text('request_hash'),
    // status: 'completed' | 'voided'
    status: text('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    moneySnapshot: check(
      'sales_returns_money_snapshot_check',
      sql.raw(
        '(debt_reduction_amount IS NULL AND refund_due_amount IS NULL) OR (debt_reduction_amount IS NOT NULL AND refund_due_amount IS NOT NULL AND debt_reduction_amount>=0 AND refund_due_amount>=0 AND debt_reduction_amount+refund_due_amount=total)',
      ),
    ),
    tenantUnique: unique('sales_returns_id_business_unique').on(t.id, t.businessId),
    businessIdx: index('sales_returns_business_id_idx').on(t.businessId),
    originalSaleIdx: index('sales_returns_original_sale_id_idx').on(t.originalSaleId),
    businessCreatedIdx: index('sales_returns_business_created_at_idx').on(
      t.businessId,
      t.createdAt,
    ),
  }),
);

export const returnItems = pgTable(
  'return_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => salesReturns.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    gstAmount: numeric('gst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    costPriceAtSale: numeric('cost_price_at_sale', { precision: 10, scale: 2 }),
  },
  (t) => ({
    returnIdx: index('return_items_return_id_idx').on(t.returnId),
    productIdx: index('return_items_product_id_idx').on(t.productId),
  }),
);

export type SalesReturn = typeof salesReturns.$inferSelect;
export type NewSalesReturn = typeof salesReturns.$inferInsert;
export type ReturnItem = typeof returnItems.$inferSelect;
export type NewReturnItem = typeof returnItems.$inferInsert;
