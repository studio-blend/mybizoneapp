import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { customers } from './customers';
import { products } from './products';
import { sales } from './sales';

export const deliveryChallans = pgTable(
  'delivery_challans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    dcNo: text('dc_no').notNull(),
    // status: 'draft' | 'dispatched' | 'delivered' | 'converted' | 'cancelled'
    status: text('status').notNull().default('draft'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    convertedToSaleId: uuid('converted_to_sale_id').references(() => sales.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessIdx: index('delivery_challans_business_id_idx').on(t.businessId),
    customerIdx: index('delivery_challans_customer_id_idx').on(t.customerId),
    businessCreatedIdx: index('delivery_challans_business_created_at_idx').on(t.businessId, t.createdAt),
  }),
);

export const dcItems = pgTable(
  'dc_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dcId: uuid('dc_id')
      .notNull()
      .references(() => deliveryChallans.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull().default('0'),
  },
  (t) => ({
    dcIdx: index('dc_items_dc_id_idx').on(t.dcId),
  }),
);

export type DeliveryChallan = typeof deliveryChallans.$inferSelect;
export type NewDeliveryChallan = typeof deliveryChallans.$inferInsert;
export type DcItem = typeof dcItems.$inferSelect;
export type NewDcItem = typeof dcItems.$inferInsert;
