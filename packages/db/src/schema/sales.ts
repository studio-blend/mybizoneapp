import { index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { products } from './products';
import { stores } from './stores';

// A completed sale, atomic with its sale_items + inventory decrement (see Chunk 4 for tx logic).
// payment_method, status, bill_no kept as text to allow per-business expansion without new migrations.
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id').references(() => user.id, { onDelete: 'set null' }),
    billNo: text('bill_no').notNull(),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerGstin: text('customer_gstin'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(), // 'cash' | 'upi' | 'card' | 'other'
    billImageKey: text('bill_image_key'),
    notes: text('notes'),
    status: text('status').notNull().default('completed'), // 'completed' | 'voided' | 'refunded'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessCreatedIdx: index('sales_business_created_at_idx').on(t.businessId, t.createdAt),
    storeCreatedIdx: index('sales_store_created_at_idx').on(t.storeId, t.createdAt),
    employeeIdx: index('sales_employee_id_idx').on(t.employeeId),
    billNoUnique: unique('sales_business_bill_no_unique').on(t.businessId, t.billNo),
  }),
);

// sale_items snapshot the pricing/tax fields from the product at sale time so reports
// remain accurate even if the product is later edited or deleted.
export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    gstAmount: numeric('gst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    costPriceAtSale: numeric('cost_price_at_sale', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    saleIdx: index('sale_items_sale_id_idx').on(t.saleId),
    productIdx: index('sale_items_product_id_idx').on(t.productId),
    businessIdx: index('sale_items_business_id_idx').on(t.businessId),
  }),
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
