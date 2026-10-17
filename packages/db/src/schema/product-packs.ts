import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { businesses } from './businesses';
import { products } from './products';
export interface PackSnapshot {
  name: string;
  factor: string;
  packs: string;
  loose: string;
  unit: string;
  unitType: string;
}
export function validPackSnapshot(s: AnyPgColumn, qty: AnyPgColumn, unit: AnyPgColumn) {
  return sql`${s} IS NULL OR COALESCE(CASE WHEN jsonb_typeof(${s})='object' AND (${s}->>'factor') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' AND (${s}->>'packs') ~ '^[0-9]{1,9}$' AND (${s}->>'loose') ~ '^[0-9]{1,9}([.][0-9]{1,3})?$' THEN length(trim(${s}->>'name')) BETWEEN 1 AND 60 AND (${s}->>'factor')::numeric>0 AND (${s}->>'unit')=${unit} AND (${s}->>'factor')::numeric*(${s}->>'packs')::numeric+(${s}->>'loose')::numeric=${qty} AND (${s}->>'unitType'<>'piece' OR (mod((${s}->>'factor')::numeric,1)=0 AND mod((${s}->>'loose')::numeric,1)=0)) ELSE FALSE END,FALSE)`;
}
export const productPacks = pgTable(
  'product_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    name: text('name').notNull(),
    unitType: text('unit_type').notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    qtyPerPack: numeric('qty_per_pack', { precision: 12, scale: 3 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    product: foreignKey({
      name: 'product_packs_product_fk',
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }).onDelete('cascade'),
    name: check('product_packs_name_check', sql`length(trim(${t.name})) BETWEEN 1 AND 60`),
    quantity: check(
      'product_packs_quantity_check',
      sql`${t.qtyPerPack}>0 AND (${t.unitType}<>'piece' OR mod(${t.qtyPerPack},1)=0)`,
    ),
    activeName: uniqueIndex('product_packs_active_name_unique')
      .on(t.businessId, t.productId, sql`lower(${t.name})`)
      .where(sql`${t.active}`),
    productIdx: index('product_packs_product_idx').on(t.businessId, t.productId),
  }),
);
