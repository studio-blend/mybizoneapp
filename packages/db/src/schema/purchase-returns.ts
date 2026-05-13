import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { products } from './products';
import { purchases } from './purchases';
import { suppliers } from './suppliers';

// A purchase return records goods returned to a supplier. Decreases product
// inventory on each line item and adjusts the supplier's outstanding_balance
// (applied transactionally in the API layer).
export const purchaseReturns = pgTable(
  'purchase_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    originalPurchaseId: uuid('original_purchase_id').references(() => purchases.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    supplierName: text('supplier_name').notNull(),
    returnNo: text('return_no').notNull(),
    reason: text('reason'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    // status: 'completed' | 'voided'
    status: text('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('purchase_returns_business_id_idx').on(t.businessId),
    originalPurchaseIdx: index('purchase_returns_original_purchase_id_idx').on(t.originalPurchaseId),
    businessCreatedIdx: index('purchase_returns_business_created_at_idx').on(t.businessId, t.createdAt),
  }),
);

export const purchaseReturnItems = pgTable(
  'purchase_return_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    returnId: uuid('return_id')
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    gstAmount: numeric('gst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => ({
    returnIdx: index('purchase_return_items_return_id_idx').on(t.returnId),
    productIdx: index('purchase_return_items_product_id_idx').on(t.productId),
  }),
);

export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type NewPurchaseReturn = typeof purchaseReturns.$inferInsert;
export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type NewPurchaseReturnItem = typeof purchaseReturnItems.$inferInsert;
