import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { businesses } from './businesses';
import { customers } from './customers';
import { purchaseReturns } from './purchase-returns';
import { purchaseSettlements } from './purchase-settlements';
import { salesReturns } from './sales-returns';
import { salesSettlements } from './sales-settlements';
import { salesSettlementAllocations } from './settlement-allocations';
import { purchaseSettlementAllocations } from './settlement-allocations';
import { suppliers } from './suppliers';
export const accountingEvents = pgTable(
  'accounting_events',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    kind: text('kind').notNull(),
    customerId: uuid('customer_id'),
    supplierId: uuid('supplier_id'),
    sourceEventId: uuid('source_event_id'),
    salesSettlementId: uuid('sales_settlement_id'),
    purchaseSettlementId: uuid('purchase_settlement_id'),
    salesAllocationId: uuid('sales_allocation_id'),
    purchaseAllocationId: uuid('purchase_allocation_id'),
    salesReturnId: uuid('sales_return_id'),
    purchaseReturnId: uuid('purchase_return_id'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: text('method'),
    reference: text('reference'),
    note: text('note').notNull(),
    requestHash: text('request_hash').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identity: unique('accounting_events_id_business_side_unique').on(t.id, t.businessId, t.side),
    fk1: foreignKey({
      columns: [t.customerId, t.businessId],
      foreignColumns: [customers.id, customers.businessId],
    }),
    fk2: foreignKey({
      columns: [t.supplierId, t.businessId],
      foreignColumns: [suppliers.id, suppliers.businessId],
    }),
    fk3: foreignKey({
      columns: [t.sourceEventId, t.businessId, t.side],
      foreignColumns: [t.id, t.businessId, t.side],
    }),
    fk4: foreignKey({
      columns: [t.salesSettlementId, t.businessId],
      foreignColumns: [salesSettlements.id, salesSettlements.businessId],
    }),
    fk5: foreignKey({
      columns: [t.purchaseSettlementId, t.businessId],
      foreignColumns: [purchaseSettlements.id, purchaseSettlements.businessId],
    }),
    fk6: foreignKey({
      columns: [t.salesAllocationId, t.businessId],
      foreignColumns: [salesSettlementAllocations.id, salesSettlementAllocations.businessId],
    }),
    fk7: foreignKey({
      columns: [t.purchaseAllocationId, t.businessId],
      foreignColumns: [purchaseSettlementAllocations.id, purchaseSettlementAllocations.businessId],
    }),
    fk8: foreignKey({
      columns: [t.salesReturnId, t.businessId],
      foreignColumns: [salesReturns.id, salesReturns.businessId],
    }),
    fk9: foreignKey({
      columns: [t.purchaseReturnId, t.businessId],
      foreignColumns: [purchaseReturns.id, purchaseReturns.businessId],
    }),
    check0: check('accounting_events_check_0', sql.raw("side IN ('sales','purchases')")),
    check1: check(
      'accounting_events_check_1',
      sql.raw(
        "kind IN ('advance','advance_apply','advance_refund','return_refund','settlement_reverse','allocation_reverse','money_reverse')",
      ),
    ),
    check2: check('accounting_events_check_2', sql.raw('amount>0')),
    check3: check('accounting_events_check_3', sql.raw('length(trim(note)) BETWEEN 3 AND 500')),
    check4: check(
      'accounting_events_check_4',
      sql.raw(
        "(side='sales' AND supplier_id IS NULL AND purchase_settlement_id IS NULL AND purchase_allocation_id IS NULL AND purchase_return_id IS NULL) OR (side='purchases' AND customer_id IS NULL AND sales_settlement_id IS NULL AND sales_allocation_id IS NULL AND sales_return_id IS NULL)",
      ),
    ),
    check5: check(
      'accounting_events_check_5',
      sql.raw(
        "(kind IN ('advance_apply','allocation_reverse') AND method IS NULL) OR (kind NOT IN ('advance_apply','allocation_reverse') AND method IS NOT NULL AND method IN ('cash','upi','card','bank','cheque','other'))",
      ),
    ),
    check6: check(
      'accounting_events_check_6',
      sql.raw(
        "(kind='advance' AND source_event_id IS NULL AND num_nonnulls(customer_id,supplier_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)\n OR (kind='advance_apply' AND source_event_id IS NOT NULL AND num_nonnulls(customer_id,supplier_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id)=1 AND num_nonnulls(sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)\n OR (kind IN ('advance_refund','money_reverse') AND source_event_id IS NOT NULL AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)\n OR (kind='return_refund' AND source_event_id IS NULL AND num_nonnulls(sales_return_id,purchase_return_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_allocation_id,purchase_allocation_id)=0)\n OR (kind='settlement_reverse' AND source_event_id IS NULL AND num_nonnulls(sales_settlement_id,purchase_settlement_id)=1 AND num_nonnulls(sales_allocation_id,purchase_allocation_id,sales_return_id,purchase_return_id)=0)\n OR (kind='allocation_reverse' AND source_event_id IS NULL AND num_nonnulls(sales_allocation_id,purchase_allocation_id)=1 AND num_nonnulls(sales_settlement_id,purchase_settlement_id,sales_return_id,purchase_return_id)=0)",
      ),
    ),
    idx17: uniqueIndex('accounting_events_settlement_reverse_sales')
      .on(t.salesSettlementId)
      .where(sql.raw("kind='settlement_reverse'")),
    idx18: uniqueIndex('accounting_events_settlement_reverse_purchase')
      .on(t.purchaseSettlementId)
      .where(sql.raw("kind='settlement_reverse'")),
    idx19: uniqueIndex('accounting_events_allocation_reverse_sales')
      .on(t.salesAllocationId)
      .where(sql.raw("kind='allocation_reverse'")),
    idx20: uniqueIndex('accounting_events_allocation_reverse_purchase')
      .on(t.purchaseAllocationId)
      .where(sql.raw("kind='allocation_reverse'")),
    idx21: uniqueIndex('accounting_events_money_reverse')
      .on(t.sourceEventId)
      .where(sql.raw("kind='money_reverse'")),
    idx22: uniqueIndex('accounting_events_advance_sales')
      .on(t.salesSettlementId)
      .where(sql.raw("kind='advance_apply'")),
    idx23: uniqueIndex('accounting_events_advance_purchase')
      .on(t.purchaseSettlementId)
      .where(sql.raw("kind='advance_apply'")),
    idx24: index('accounting_events_party_sales').on(t.businessId, t.customerId, t.createdAt),
    idx25: index('accounting_events_party_purchase').on(t.businessId, t.supplierId, t.createdAt),
    idx26: index('accounting_events_source').on(t.businessId, t.sourceEventId),
    idx27: index('accounting_events_return_sales').on(t.businessId, t.salesReturnId),
    idx28: index('accounting_events_return_purchase').on(t.businessId, t.purchaseReturnId),
  }),
);
