import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { products } from './products';
import { suppliers } from './suppliers';

// A purchase records goods received from a supplier. Increases the supplier's
// outstanding_balance when payment_method = 'credit', and increases product
// inventory on each line item (applied transactionally in the API layer).
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    // Snapshot of supplier name at purchase time in case supplier is later deleted.
    supplierName: text('supplier_name').notNull(),
    billNo: text('bill_no').notNull(),
    // financialYear is the Indian FY string, e.g. '2025-26'. Used for FY-scoped
    // reporting and bill series numbering.
    financialYear: text('financial_year'),
    purchaseDate: timestamp('purchase_date', { withTimezone: true }).notNull().defaultNow(),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    // paymentMethod: 'cash' | 'upi' | 'card' | 'credit' | 'other'
    paymentMethod: text('payment_method').notNull(),
    notes: text('notes'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('purchases_business_id_idx').on(t.businessId),
    supplierIdx: index('purchases_supplier_id_idx').on(t.supplierId),
    businessPurchaseDateIdx: index('purchases_business_purchase_date_idx').on(t.businessId, t.purchaseDate),
    businessFinancialYearIdx: index('purchases_business_financial_year_idx').on(t.businessId, t.financialYear),
  }),
);

export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
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
    purchaseIdx: index('purchase_items_purchase_id_idx').on(t.purchaseId),
    productIdx: index('purchase_items_product_id_idx').on(t.productId),
  }),
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;
