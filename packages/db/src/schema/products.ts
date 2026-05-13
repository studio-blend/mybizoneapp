import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { brands } from './brands';
import { businesses } from './businesses';
import { categories } from './categories';
import { stores } from './stores';

// Inventory + price live as NUMERIC so fractional units (1.5 kg, 2.75 m) round-trip without float drift.
// gst_rate is nullable because tax-exempt businesses (gst_enabled=false) don't carry a rate.
// hsn_code is the harmonized system nomenclature key used by GST invoicing.
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    description: text('description'),
    unitType: text('unit_type').notNull(), // 'piece' | 'weight' | 'length' | 'area' | 'volume'
    unitSymbol: text('unit_symbol').notNull(), // 'pc' | 'kg' | 'g' | 'm' | 'cm' | 'sqft' | 'litre' | ...
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    costPrice: numeric('cost_price', { precision: 10, scale: 2 }),
    mrp: numeric('mrp', { precision: 10, scale: 2 }),
    wholesalePrice: numeric('wholesale_price', { precision: 10, scale: 2 }),
    rate1: numeric('rate_1', { precision: 10, scale: 2 }),
    rate2: numeric('rate_2', { precision: 10, scale: 2 }),
    rate3: numeric('rate_3', { precision: 10, scale: 2 }),
    rate4: numeric('rate_4', { precision: 10, scale: 2 }),
    // minStock is the reorder level; dashboard alerts when inventory drops below this.
    minStock: numeric('min_stock', { precision: 12, scale: 3 }),
    inventory: numeric('inventory', { precision: 12, scale: 3 }).notNull().default('0'),
    hsnCode: text('hsn_code'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
    imageKey: text('image_key'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    businessStoreIdx: index('products_business_store_idx').on(t.businessId, t.storeId),
    categoryIdx: index('products_category_id_idx').on(t.categoryId),
    brandIdx: index('products_brand_id_idx').on(t.brandId),
    nameIdx: index('products_business_name_idx').on(t.businessId, t.name),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
