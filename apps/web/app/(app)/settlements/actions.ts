'use server';

import { db } from '@/lib/db';
import { safeAction } from '@/lib/server-action';
import {
  auditLogs,
  customers,
  purchaseSettlements,
  salesSettlements,
  suppliers,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, {
  message: 'expected a number with up to 2 decimal places',
});
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => v?.trim() || null);

const paymentMethod = z.enum(['cash', 'upi', 'card', 'cheque', 'other']);

// ─── Sales Settlement ────────────────────────────────────────────────────────

const SalesSettlementInput = z.object({
  customerId: uuid,
  amount: moneyText,
  paymentMethod,
  referenceNo: optionalText(100),
  notes: optionalText(500),
});

export const createSalesSettlementAction = safeAction(
  SalesSettlementInput,
  async (input, { user, tx }) => {
    // 1. Fetch the customer row
    const [customer] = await tx
      .select({
        id: customers.id,
        name: customers.name,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(
        and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)),
      );

    // 2. Guard: customer must exist in this business
    if (!customer) throw new Error('customer not found');

    // 3. Guard: amount must be positive
    if (Number(input.amount) <= 0) throw new Error('amount must be greater than zero');

    // 4. Overpay is allowed — just log it
    if (Number(input.amount) > Number(customer.outstandingBalance)) {
      console.info(
        `[settlements] overpayment: customer ${customer.id} owes ${customer.outstandingBalance}, received ${input.amount}`,
      );
    }

    // 5. Insert settlement record
    const [row] = await tx
      .insert(salesSettlements)
      .values({
        businessId: user.businessId,
        customerId: input.customerId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceNo: input.referenceNo,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning({ id: salesSettlements.id });
    if (!row) throw new Error('insert failed');

    // 6. Update customer outstanding balance — clamp to 0
    await tx
      .update(customers)
      .set({
        outstandingBalance: sql`GREATEST(0, ${customers.outstandingBalance} - ${input.amount}::numeric)`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)),
      );

    // 7. Audit log
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'settlement.sales.create',
      entity: 'sales_settlement',
      entityId: row.id,
      after: {
        customerId: input.customerId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      },
    });

    // 8. Revalidate
    revalidatePath('/settlements');
    revalidatePath('/customers');

    // Derive new balance (clamped)
    const newBalance = Math.max(
      0,
      Number(customer.outstandingBalance) - Number(input.amount),
    ).toFixed(2);

    return { id: row.id, customerId: input.customerId, amount: input.amount, newBalance };
  },
);

// ─── Purchase Settlement ─────────────────────────────────────────────────────

const PurchaseSettlementInput = z.object({
  supplierId: uuid,
  amount: moneyText,
  paymentMethod,
  referenceNo: optionalText(100),
  notes: optionalText(500),
});

export const createPurchaseSettlementAction = safeAction(
  PurchaseSettlementInput,
  async (input, { user, tx }) => {
    // 1. Fetch the supplier row
    const [supplier] = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)),
      );

    // 2. Guard: supplier must exist in this business
    if (!supplier) throw new Error('supplier not found');

    // 3. Guard: amount must be positive
    if (Number(input.amount) <= 0) throw new Error('amount must be greater than zero');

    // 4. Overpay is allowed — just log it
    if (Number(input.amount) > Number(supplier.outstandingBalance)) {
      console.info(
        `[settlements] overpayment: supplier ${supplier.id} owes ${supplier.outstandingBalance}, paid ${input.amount}`,
      );
    }

    // 5. Insert settlement record
    const [row] = await tx
      .insert(purchaseSettlements)
      .values({
        businessId: user.businessId,
        supplierId: input.supplierId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceNo: input.referenceNo,
        notes: input.notes,
        createdBy: user.id,
      })
      .returning({ id: purchaseSettlements.id });
    if (!row) throw new Error('insert failed');

    // 6. Update supplier outstanding balance — clamp to 0
    await tx
      .update(suppliers)
      .set({
        outstandingBalance: sql`GREATEST(0, ${suppliers.outstandingBalance} - ${input.amount}::numeric)`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)),
      );

    // 7. Audit log
    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'settlement.purchase.create',
      entity: 'purchase_settlement',
      entityId: row.id,
      after: {
        supplierId: input.supplierId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      },
    });

    // 8. Revalidate
    revalidatePath('/settlements');
    revalidatePath('/suppliers');

    const newBalance = Math.max(
      0,
      Number(supplier.outstandingBalance) - Number(input.amount),
    ).toFixed(2);

    return { id: row.id, supplierId: input.supplierId, amount: input.amount, newBalance };
  },
);
