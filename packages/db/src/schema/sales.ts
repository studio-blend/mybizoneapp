import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { customers } from './customers';
import { type PackSnapshot, validPackSnapshot } from './product-packs';
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
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    // financialYear stores '2025-26' to enable fast FY-scoped bill number queries.
    financialYear: text('financial_year'),
    billNo: text('bill_no').notNull(),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerGstin: text('customer_gstin'),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
    // Frozen at sale creation. Null identifies legacy records needing reconciliation.
    gstEnabledAtSale: boolean('gst_enabled_at_sale'),
    businessGstinAtSale: text('business_gstin_at_sale'),
    isInterstate: boolean('is_interstate'),
    cgst: numeric('cgst', { precision: 12, scale: 2 }),
    sgst: numeric('sgst', { precision: 12, scale: 2 }),
    igst: numeric('igst', { precision: 12, scale: 2 }),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(), // 'cash' | 'upi' | 'card_debit' | 'card_credit' | 'finance_emi' | 'cheque' | 'credit' | 'other'
    // M8: structured payment breakdown — UPI ref, last4 + bank, EMI details, cheque no., etc.
    paymentDetails: jsonb('payment_details'),
    // M8: bill_type controls inventory + GST behaviour:
    //   'gst_bill' — standard sale, decrements stock, GST shown
    //   'non_gst_bill' — sale without GST line items
    //   'estimate' — quotation-style, NO stock decrement, NO bill series
    billType: text('bill_type').notNull().default('gst_bill'),
    // M8: dueDate populated for estimates + EMI bills; null otherwise.
    dueDate: date('due_date'),
    // M8: paymentStatus tracks settlement progress: 'paid' | 'partial' | 'due' | 'overdue'.
    paymentStatus: text('payment_status').notNull().default('paid'),
    billImageKey: text('bill_image_key'),
    notes: text('notes'),
    status: text('status').notNull().default('completed'), // 'completed' | 'voided' | 'refunded'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUnique: unique('sales_id_business_unique').on(t.id, t.businessId),
    taxSnapshotConsistent: check(
      'sales_tax_snapshot_consistent',
      sql`
      (${t.cgst} IS NULL AND ${t.sgst} IS NULL AND ${t.igst} IS NULL)
      OR (${t.cgst} IS NOT NULL AND ${t.sgst} IS NOT NULL AND ${t.igst} IS NOT NULL
        AND ${t.cgst} >= 0 AND ${t.sgst} >= 0 AND ${t.igst} >= 0
        AND ${t.cgst} + ${t.sgst} + ${t.igst} = ${t.taxTotal})
    `,
    ),
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
    packSnapshot: jsonb('pack_snapshot').$type<PackSnapshot>(),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    gstAmount: numeric('gst_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    costPriceAtSale: numeric('cost_price_at_sale', { precision: 10, scale: 2 }),
    // M8: per-line ₹ discount (subtracted from lineSubtotal before GST calc).
    itemDiscount: numeric('item_discount', { precision: 10, scale: 2 }).notNull().default('0'),
    // M8: free items — line displayed on bill with lineTotal=0.
    isFreeItem: boolean('is_free_item').notNull().default(false),
    freeQty: numeric('free_qty', { precision: 12, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    saleIdx: index('sale_items_sale_id_idx').on(t.saleId),
    pack: check('sale_items_pack_check', validPackSnapshot(t.packSnapshot, t.qty, t.unitSymbol)),
    productIdx: index('sale_items_product_id_idx').on(t.productId),
    businessIdx: index('sale_items_business_id_idx').on(t.businessId),
  }),
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
