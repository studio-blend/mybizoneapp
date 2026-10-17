import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { damageLogs } from './damage-logs';
import { products } from './products';
import { stores } from './stores';

export const kitchenRecipes = pgTable(
  'kitchen_recipes',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull(),
    outputProductId: uuid('output_product_id').notNull(),
    name: text('name').notNull(),
    outputName: text('output_name').notNull(),
    unitType: text('unit_type').notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    yieldQty: numeric('yield_qty', { precision: 12, scale: 3 }).notNull(),
    active: boolean('active').notNull().default(true),
    requestHash: text('request_hash').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenant: unique('kitchen_recipes_id_business_unique').on(t.id, t.businessId),
    store: foreignKey({
      columns: [t.storeId, t.businessId],
      foreignColumns: [stores.id, stores.businessId],
    }),
    output: foreignKey({
      columns: [t.outputProductId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }),
    name: check('kitchen_recipes_name_check', sql`length(trim(${t.name})) BETWEEN 1 AND 100`),
    qty: check(
      'kitchen_recipes_yield_check',
      sql`${t.yieldQty}>0 AND (${t.unitType}<>'piece' OR mod(${t.yieldQty},1)=0)`,
    ),
    lookup: index('kitchen_recipes_store_idx').on(t.businessId, t.storeId, t.active),
  }),
);
export const kitchenRecipeItems = pgTable(
  'kitchen_recipe_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    unitType: text('unit_type').notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  },
  (t) => ({
    recipe: foreignKey({
      columns: [t.recipeId, t.businessId],
      foreignColumns: [kitchenRecipes.id, kitchenRecipes.businessId],
    }).onDelete('cascade'),
    product: foreignKey({
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }),
    one: unique('kitchen_recipe_items_product_unique').on(t.recipeId, t.productId),
    qty: check(
      'kitchen_recipe_items_qty_check',
      sql`${t.qty}>0 AND (${t.unitType}<>'piece' OR mod(${t.qty},1)=0)`,
    ),
  }),
);
export const kitchenTickets = pgTable(
  'kitchen_tickets',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id').notNull(),
    storeId: uuid('store_id').notNull(),
    reference: text('reference').notNull(),
    runs: integer('runs').notNull(),
    status: text('status').notNull().default('queued'),
    note: text('note').notNull().default(''),
    requestHash: text('request_hash').notNull(),
    completionHash: text('completion_hash'),
    actualOutput: numeric('actual_output', { precision: 12, scale: 3 }),
    ingredientCost: numeric('ingredient_cost', { precision: 14, scale: 2 }),
    unitCost: numeric('unit_cost', { precision: 10, scale: 2 }),
    batchCode: text('batch_code'),
    expiresOn: date('expires_on'),
    completionNote: text('completion_note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    completedBy: text('completed_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    tenant: unique('kitchen_tickets_id_business_unique').on(t.id, t.businessId),
    recipe: foreignKey({
      columns: [t.recipeId, t.businessId],
      foreignColumns: [kitchenRecipes.id, kitchenRecipes.businessId],
    }),
    store: foreignKey({
      columns: [t.storeId, t.businessId],
      foreignColumns: [stores.id, stores.businessId],
    }),
    runs: check('kitchen_tickets_runs_check', sql`${t.runs} BETWEEN 1 AND 10000`),
    reference: check(
      'kitchen_tickets_reference_check',
      sql`length(trim(${t.reference})) BETWEEN 1 AND 100`,
    ),
    state: check(
      'kitchen_tickets_status_check',
      sql`${t.status} IN ('queued','preparing','completed','cancelled')`,
    ),
    completion: check(
      'kitchen_tickets_completion_check',
      sql`(${t.status}='completed' AND ${t.actualOutput} IS NOT NULL AND ${t.actualOutput}>0 AND ${t.completedAt} IS NOT NULL AND ${t.completionHash} IS NOT NULL) OR (${t.status}<>'completed' AND ${t.actualOutput} IS NULL AND ${t.completedAt} IS NULL AND ${t.completionHash} IS NULL)`,
    ),
    costs: check(
      'kitchen_tickets_cost_check',
      sql`(${t.ingredientCost} IS NULL)=(${t.unitCost} IS NULL) AND (${t.ingredientCost} IS NULL OR ${t.ingredientCost}>=0) AND (${t.unitCost} IS NULL OR ${t.unitCost}>=0)`,
    ),
    queue: index('kitchen_tickets_queue_idx').on(t.businessId, t.storeId, t.status, t.createdAt),
  }),
);
export const kitchenConsumptions = pgTable(
  'kitchen_consumptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    unitSymbol: text('unit_symbol').notNull(),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
    costPerUnit: numeric('cost_per_unit', { precision: 10, scale: 2 }),
    totalValue: numeric('total_value', { precision: 12, scale: 2 }),
  },
  (t) => ({
    ticket: foreignKey({
      columns: [t.ticketId, t.businessId],
      foreignColumns: [kitchenTickets.id, kitchenTickets.businessId],
    }).onDelete('cascade'),
    product: foreignKey({
      columns: [t.productId, t.businessId],
      foreignColumns: [products.id, products.businessId],
    }),
    one: unique('kitchen_consumptions_product_unique').on(t.ticketId, t.productId),
    qty: check('kitchen_consumptions_qty_check', sql`${t.qty}>0`),
    costs: check(
      'kitchen_consumptions_cost_check',
      sql`(${t.costPerUnit} IS NULL)=(${t.totalValue} IS NULL) AND (${t.costPerUnit} IS NULL OR ${t.costPerUnit}>=0) AND (${t.totalValue} IS NULL OR ${t.totalValue}>=0)`,
    ),
  }),
);
export const kitchenWaste = pgTable(
  'kitchen_waste',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').notNull(),
    damageId: uuid('damage_id').notNull(),
    reason: text('reason').notNull(),
    requestHash: text('request_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    store: foreignKey({
      columns: [t.storeId, t.businessId],
      foreignColumns: [stores.id, stores.businessId],
    }),
    damage: foreignKey({
      columns: [t.damageId, t.businessId],
      foreignColumns: [damageLogs.id, damageLogs.businessId],
    }),
    one: unique('kitchen_waste_damage_unique').on(t.damageId),
    reason: check(
      'kitchen_waste_reason_check',
      sql`${t.reason} IN ('preparation','unsold','spillage','expired','other')`,
    ),
    lookup: index('kitchen_waste_store_idx').on(t.businessId, t.storeId, t.createdAt),
  }),
);
