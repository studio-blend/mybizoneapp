import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { products } from './products';

export const stockBatches = pgTable(
  'stock_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    code: text('code').notNull(),
    expiresOn: date('expires_on'),
    state: text('state').notNull().default('available'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productCode: unique('stock_batches_product_code_unique').on(t.productId, t.code),
    idTenant: unique('stock_batches_id_tenant_unique').on(t.id, t.businessId),
    productTenant: foreignKey({
      name: 'stock_batches_product_tenant_fk',
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }).onDelete('cascade'),
    codeCheck: check('stock_batches_code_check', sql`length(trim(${t.code})) BETWEEN 1 AND 80`),
    stateCheck: check('stock_batches_state_check', sql`${t.state} IN ('available','quarantine')`),
    quantityCheck: check('stock_batches_quantity_check', sql`${t.quantity} >= 0`),
    expiryCheck: check(
      'stock_batches_expiry_required',
      sql`${t.state} = 'quarantine' OR ${t.expiresOn} IS NOT NULL`,
    ),
    expiry: index('stock_batches_expiry_idx').on(t.businessId, t.expiresOn, t.productId),
    product: index('stock_batches_product_idx').on(t.productId),
  }),
);

// Append-only allocations identify exactly which batches supplied each document.
export const stockBatchMovements = pgTable(
  'stock_batch_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),
    kind: text('kind').notNull(),
    documentId: uuid('document_id').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    batchTenant: foreignKey({
      name: 'stock_batch_movements_batch_tenant_fk',
      columns: [t.batchId, t.businessId],
      foreignColumns: [stockBatches.id, stockBatches.businessId],
    }).onDelete('cascade'),
    kindCheck: check(
      'stock_batch_movements_kind_check',
      sql`${t.kind} IN ('opening','purchase','sale','sales_return','purchase_return','damage')`,
    ),
    quantityCheck: check('stock_batch_movements_quantity_check', sql`${t.quantity} <> 0`),
    signCheck: check(
      'stock_batch_movements_sign',
      sql`(${t.kind} IN ('opening','purchase','sales_return') AND ${t.quantity} > 0) OR (${t.kind} IN ('sale','purchase_return','damage') AND ${t.quantity} < 0)`,
    ),
    document: index('stock_batch_movements_document_idx').on(t.businessId, t.kind, t.documentId),
    batch: index('stock_batch_movements_batch_idx').on(t.batchId),
  }),
);
