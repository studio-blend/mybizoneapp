import { sql } from 'drizzle-orm';
import type { SettlementSide } from './settlement-ledger';
export function eventColumns(side: SettlementSide) {
  const sale = side === 'sales';
  return {
    payment: sql.identifier(sale ? 'sales_settlement_id' : 'purchase_settlement_id'),
    allocation: sql.identifier(sale ? 'sales_allocation_id' : 'purchase_allocation_id'),
    returned: sql.identifier(sale ? 'sales_return_id' : 'purchase_return_id'),
  };
}
export function activeAllocation(side: SettlementSide, alias = 'a') {
  const a = sql.identifier(alias);
  const c = eventColumns(side);
  return sql`NOT EXISTS(SELECT 1 FROM accounting_events ae WHERE ae.business_id=${a}.business_id AND ae.kind='allocation_reverse' AND ae.${c.allocation}=${a}.id)`;
}
export function activePayment(side: SettlementSide, alias = 'p') {
  const p = sql.identifier(alias);
  const c = eventColumns(side);
  return sql`NOT EXISTS(SELECT 1 FROM accounting_events ae WHERE ae.business_id=${p}.business_id AND ae.kind='settlement_reverse' AND ae.${c.payment}=${p}.id)`;
}
