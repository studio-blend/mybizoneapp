import { customers, productPacks } from '@mybizone/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod/v3';
import type { OrderTx } from './order-ledger';
import { centsText } from './order-policy';
import { type PackInput, convertPack } from './pack-policy';
export const packFields = {
  packId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || undefined),
  packCount: z
    .string()
    .regex(/^\d{1,9}$/)
    .optional(),
  looseQty: z
    .string()
    .regex(/^\d{1,9}(?:\.\d{1,3})?$/)
    .optional(),
};
export async function activePacks(tx: OrderTx, businessId: string, productIds: string[]) {
  if (!productIds.length) return [];
  return tx
    .select()
    .from(productPacks)
    .where(
      and(
        eq(productPacks.businessId, businessId),
        eq(productPacks.active, true),
        inArray(productPacks.productId, productIds),
      ),
    );
}
export async function resolvePack(
  tx: OrderTx,
  businessId: string,
  product: { id: string; unitType: string; unitSymbol: string },
  input: PackInput,
) {
  if (!input.packId) {
    if (Number(input.packCount ?? 0) || Number(input.looseQty ?? 0))
      throw new Error('Choose a pack for pack quantities');
    return { qty: input.qty, packSnapshot: null };
  }
  const [pack] = await tx
    .select()
    .from(productPacks)
    .where(
      and(
        eq(productPacks.id, input.packId),
        eq(productPacks.productId, product.id),
        eq(productPacks.businessId, businessId),
        eq(productPacks.active, true),
      ),
    )
    .for('share');
  if (!pack || pack.unitType !== product.unitType || pack.unitSymbol !== product.unitSymbol)
    throw new Error(
      'Pack is unavailable or its stock unit changed. Refresh the product selection.',
    );
  return convertPack(pack, input.packCount ?? '0', input.looseQty ?? '0');
}
export function withinCreditLimit(amountCents: number) {
  if (amountCents <= 0) return sql`TRUE`;
  return sql`(${customers.creditLimit}=0 OR ${customers.outstandingBalance}+${centsText(amountCents)}::numeric<=${customers.creditLimit})`;
}
export async function assertCustomerCredit(tx: OrderTx, businessId: string, customerId: string) {
  const [row] = await tx
    .select({ limit: customers.creditLimit, debt: customers.outstandingBalance })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .for('update');
  if (!row) throw new Error('Customer not found');
  if (Number(row.limit) > 0 && Number(row.debt) > Number(row.limit))
    throw new Error(
      'Customer credit limit exceeded. Record a payment or reduce the unpaid delivery.',
    );
}
