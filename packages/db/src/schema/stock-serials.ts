import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { products } from './products';

export const stockSerials = pgTable(
  'stock_serials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    code: text('code').notNull(),
    state: text('state').notNull(),
    receiptId: uuid('receipt_id'),
    lastSaleId: uuid('last_sale_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productTenant: foreignKey({
      name: 'stock_serials_product_tenant_fk',
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }).onDelete('cascade'),
    codeUnique: unique('stock_serials_business_code_unique').on(t.businessId, t.code),
    idTenant: unique('stock_serials_id_tenant_unique').on(t.id, t.businessId),
    codeCheck: check('stock_serials_code_check', sql`${t.code} ~ '^[A-Z0-9][A-Z0-9./_-]{0,79}$'`),
    stateCheck: check(
      'stock_serials_state_check',
      sql`${t.state} IN ('available','quarantine','sold','damaged','supplier_return')`,
    ),
    productState: index('stock_serials_product_state_idx').on(t.businessId, t.productId, t.state),
  }),
);

export const stockSerialEvents = pgTable(
  'stock_serial_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    serialId: uuid('serial_id').notNull(),
    kind: text('kind').notNull(),
    documentId: uuid('document_id').notNull(),
    relatedSaleId: uuid('related_sale_id'),
    warrantyMonths: integer('warranty_months').notNull().default(0),
    warrantyEndsOn: date('warranty_ends_on'),
    warrantyIssuer: text('warranty_issuer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serialTenant: foreignKey({
      name: 'stock_serial_events_tenant_fk',
      columns: [t.serialId, t.businessId],
      foreignColumns: [stockSerials.id, stockSerials.businessId],
    }).onDelete('cascade'),
    kindCheck: check(
      'stock_serial_events_kind_check',
      sql`${t.kind} IN ('opening','purchase','sale','sales_return','purchase_return','damage','hold','release')`,
    ),
    monthsCheck: check(
      'stock_serial_events_warranty_months_check',
      sql`${t.warrantyMonths} BETWEEN 0 AND 120`,
    ),
    warrantyCheck: check(
      'stock_serial_events_warranty',
      sql`(${t.warrantyMonths}=0 AND ${t.warrantyEndsOn} IS NULL AND ${t.warrantyIssuer} IS NULL) OR (${t.kind}='sale' AND ${t.warrantyMonths}>0 AND ${t.warrantyEndsOn} IS NOT NULL AND ${t.warrantyIssuer} IS NOT NULL AND length(trim(${t.warrantyIssuer})) BETWEEN 1 AND 120)`,
    ),
    document: index('stock_serial_events_document_idx').on(t.businessId, t.kind, t.documentId),
    serial: index('stock_serial_events_serial_idx').on(t.serialId, t.createdAt),
  }),
);
