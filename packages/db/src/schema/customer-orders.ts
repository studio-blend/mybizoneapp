import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
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
import { sales } from './sales';
import { stores } from './stores';
const business = () =>
  uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const customerOrders = pgTable(
  'customer_orders',
  {
    id: uuid('id').primaryKey(),
    businessId: business(),
    storeId: uuid('store_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    orderNo: text('order_no').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone'),
    customerGstin: text('customer_gstin'),
    deliveryAddress: text('delivery_address').notNull(),
    promisedOn: date('promised_on').notNull(),
    creditDays: integer('credit_days').notNull().default(0),
    tradeType: text('trade_type').notNull().default('standard'),
    status: text('status').notNull().default('open'),
    billType: text('bill_type').notNull(),
    gstEnabled: boolean('gst_enabled').notNull(),
    businessGstin: text('business_gstin'),
    isInterstate: boolean('is_interstate').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    requestHash: text('request_hash').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    store: foreignKey({
      name: 'customer_orders_store_fk',
      columns: [t.storeId, t.businessId],
      foreignColumns: [stores.id, stores.businessId],
    }),
    customer: foreignKey({
      name: 'customer_orders_customer_fk',
      columns: [t.customerId, t.businessId],
      foreignColumns: [customers.id, customers.businessId],
    }),
    tenant: unique('customer_orders_id_tenant').on(t.id, t.businessId),
    number: unique('customer_orders_no_unique').on(t.businessId, t.orderNo),
    due: index('customer_orders_store_due_idx').on(t.businessId, t.storeId, t.status, t.promisedOn),
    customerIdx: index('customer_orders_customer_idx').on(t.businessId, t.customerId),
    state: check('customer_orders_status_check', sql`${t.status} IN ('open','cancelled')`),
    creditDays: check('customer_orders_credit_days_check', sql`${t.creditDays} BETWEEN 0 AND 365`),
    tradeType: check(
      'customer_orders_trade_type_check',
      sql`${t.tradeType} IN ('standard','wholesale')`,
    ),
    bill: check(
      'customer_orders_bill_type_check',
      sql`${t.billType} IN ('gst_bill','non_gst_bill')`,
    ),
    positive: check('customer_orders_total_check', sql`${t.total}>=0`),
    address: check(
      'customer_orders_delivery_address_check',
      sql`length(trim(${t.deliveryAddress})) BETWEEN 1 AND 1000`,
    ),
    hash: check('customer_orders_request_hash_check', sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
  }),
);
export const customerOrderItems = pgTable(
  'customer_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: business(),
    orderId: uuid('order_id').notNull(),
    productId: uuid('product_id').notNull(),
    departmentId: uuid('department_id'),
    productName: text('product_name').notNull(),
    unitType: text('unit_type').notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    deliveredQty: numeric('delivered_qty', { precision: 12, scale: 3 }).notNull().default('0'),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    packSnapshot: jsonb('pack_snapshot').$type<PackSnapshot>(),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => ({
    order: foreignKey({
      name: 'customer_order_items_order_fk',
      columns: [t.orderId, t.businessId],
      foreignColumns: [customerOrders.id, customerOrders.businessId],
    }).onDelete('cascade'),
    product: foreignKey({
      name: 'customer_order_items_product_fk',
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }),
    tenant: unique('customer_order_items_id_tenant').on(t.id, t.businessId),
    itemOrder: unique('customer_order_items_id_order_tenant').on(t.id, t.orderId, t.businessId),
    productUnique: unique('customer_order_items_order_product').on(t.orderId, t.productId),
    orderIdx: index('customer_order_items_order_idx').on(t.orderId),
    qty: check('customer_order_items_qty_check', sql`${t.qty}>0`),
    delivered: check(
      'customer_order_items_delivered_qty_check',
      sql`${t.deliveredQty}>=0 AND ${t.deliveredQty}<=${t.qty}`,
    ),
    price: check('customer_order_items_unit_price_check', sql`${t.unitPrice}>=0`),
    pack: check(
      'customer_order_items_pack_check',
      validPackSnapshot(t.packSnapshot, t.qty, t.unitSymbol),
    ),
    subtotal: check('customer_order_items_subtotal_check', sql`${t.subtotal}>=0`),
    tax: check('customer_order_items_tax_total_check', sql`${t.taxTotal}>=0`),
    total: check(
      'customer_order_items_line_total_check',
      sql`${t.lineTotal}=${t.subtotal}+${t.taxTotal}`,
    ),
  }),
);
export const customerOrderPayments = pgTable(
  'customer_order_payments',
  {
    id: uuid('id').primaryKey(),
    businessId: business(),
    orderId: uuid('order_id').notNull(),
    kind: text('kind').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: text('method').notNull(),
    reference: text('reference'),
    note: text('note').notNull(),
    requestHash: text('request_hash').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({
    order: foreignKey({
      name: 'customer_order_payments_order_fk',
      columns: [t.orderId, t.businessId],
      foreignColumns: [customerOrders.id, customerOrders.businessId],
    }).onDelete('cascade'),
    orderIdx: index('customer_order_payments_order_idx').on(t.businessId, t.orderId),
    kind: check('customer_order_payments_kind_check', sql`${t.kind} IN ('receipt','refund')`),
    amount: check('customer_order_payments_amount_check', sql`${t.amount}>0`),
    method: check(
      'customer_order_payments_method_check',
      sql`${t.method} IN ('cash','upi','card','bank_transfer','other')`,
    ),
    note: check(
      'customer_order_payments_note_check',
      sql`length(trim(${t.note})) BETWEEN 3 AND 500`,
    ),
    hash: check(
      'customer_order_payments_request_hash_check',
      sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
  }),
);
export const customerOrderDeliveries = pgTable(
  'customer_order_deliveries',
  {
    id: uuid('id').primaryKey(),
    businessId: business(),
    orderId: uuid('order_id').notNull(),
    saleId: uuid('sale_id').notNull(),
    note: text('note').notNull(),
    requestHash: text('request_hash').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({
    order: foreignKey({
      name: 'customer_order_deliveries_order_fk',
      columns: [t.orderId, t.businessId],
      foreignColumns: [customerOrders.id, customerOrders.businessId],
    }).onDelete('cascade'),
    sale: foreignKey({
      name: 'customer_order_deliveries_sale_fk',
      columns: [t.saleId, t.businessId],
      foreignColumns: [sales.id, sales.businessId],
    }).onDelete('cascade'),
    tenant: unique('customer_order_deliveries_id_tenant').on(t.id, t.businessId),
    orderTenant: unique('customer_order_deliveries_id_order_tenant').on(
      t.id,
      t.orderId,
      t.businessId,
    ),
    saleUnique: unique('customer_order_deliveries_sale_unique').on(t.saleId),
    orderIdx: index('customer_order_deliveries_order_idx').on(t.orderId),
    note: check(
      'customer_order_deliveries_note_check',
      sql`length(trim(${t.note})) BETWEEN 3 AND 500`,
    ),
    hash: check(
      'customer_order_deliveries_request_hash_check',
      sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
  }),
);
export const customerOrderDeliveryItems = pgTable(
  'customer_order_delivery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: business(),
    deliveryId: uuid('delivery_id').notNull(),
    orderId: uuid('order_id').notNull(),
    orderItemId: uuid('order_item_id').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  },
  (t) => ({
    delivery: foreignKey({
      name: 'customer_order_delivery_items_delivery_fk',
      columns: [t.deliveryId, t.orderId, t.businessId],
      foreignColumns: [
        customerOrderDeliveries.id,
        customerOrderDeliveries.orderId,
        customerOrderDeliveries.businessId,
      ],
    }).onDelete('cascade'),
    item: foreignKey({
      name: 'customer_order_delivery_items_item_fk',
      columns: [t.orderItemId, t.orderId, t.businessId],
      foreignColumns: [
        customerOrderItems.id,
        customerOrderItems.orderId,
        customerOrderItems.businessId,
      ],
    }).onDelete('cascade'),
    unique: unique('customer_order_delivery_items_unique').on(t.deliveryId, t.orderItemId),
    qty: check('customer_order_delivery_items_qty_check', sql`${t.qty}>0`),
  }),
);
export const customerOrderAllocations = pgTable(
  'customer_order_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: business(),
    orderId: uuid('order_id').notNull(),
    deliveryId: uuid('delivery_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    originKind: text('origin_kind').notNull(),
    originId: uuid('origin_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    order: foreignKey({
      name: 'customer_order_allocations_order_fk',
      columns: [t.orderId, t.businessId],
      foreignColumns: [customerOrders.id, customerOrders.businessId],
    }).onDelete('cascade'),
    delivery: foreignKey({
      name: 'customer_order_allocations_delivery_fk',
      columns: [t.deliveryId, t.orderId, t.businessId],
      foreignColumns: [
        customerOrderDeliveries.id,
        customerOrderDeliveries.orderId,
        customerOrderDeliveries.businessId,
      ],
    }).onDelete('cascade'),
    unique: unique('customer_order_allocations_once').on(t.deliveryId, t.originKind, t.originId),
    orderIdx: index('customer_order_allocations_order_idx').on(t.businessId, t.orderId),
    amount: check('customer_order_allocations_amount_check', sql`${t.amount}<>0`),
    kind: check(
      'customer_order_allocations_origin_kind_check',
      sql`${t.originKind} IN ('receipt','delivery','return','return_apply')`,
    ),
    sign: check(
      'customer_order_allocations_sign',
      sql`(${t.originKind}='return' AND ${t.amount}<0) OR (${t.originKind} IN ('receipt','delivery','return_apply') AND ${t.amount}>0)`,
    ),
  }),
);
