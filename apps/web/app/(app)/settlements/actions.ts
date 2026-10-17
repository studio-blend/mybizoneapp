'use server';

import { unpaidOrderDebt } from '@/lib/order-ledger';
import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import {
  auditLogs,
  customers,
  emiPayments,
  emiSchedules,
  purchaseSettlements,
  salesSettlements,
  suppliers,
} from '@mybizone/db';
import { round2 } from '@mybizone/domain/money';
import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

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
    await requirePermission(user, 'manage_customers');
    // 1. Fetch the customer row
    const [customer] = await tx
      .select({
        id: customers.id,
        name: customers.name,
        outstandingBalance: customers.outstandingBalance,
      })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)))
      .for('update');

    // 2. Guard: customer must exist in this business
    if (!customer) throw new Error('customer not found');

    // 3. Guard: amount must be positive
    if (Number(input.amount) <= 0) throw new Error('amount must be greater than zero');

    // The ledger has no advance-credit account: reject excess instead of losing it.
    if (Number(input.amount) > Number(customer.outstandingBalance)) {
      throw new Error('amount exceeds outstanding balance');
    }

    // EMI payments have their own ledger. Keep general receipts from consuming
    // principal that will later be collected again through the EMI screen.
    const [finance] = await tx
      .select({
        amount: sql<string>`COALESCE(SUM(
      ROUND((${emiSchedules.principalAmount} - ${emiSchedules.downPayment}) * ${emiPayments.instalmentNumber} / ${emiSchedules.tenureMonths}, 2)
      - ROUND((${emiSchedules.principalAmount} - ${emiSchedules.downPayment}) * (${emiPayments.instalmentNumber} - 1) / ${emiSchedules.tenureMonths}, 2)
    ), 0)`,
      })
      .from(emiSchedules)
      .innerJoin(emiPayments, eq(emiPayments.emiScheduleId, emiSchedules.id))
      .where(
        and(
          eq(emiSchedules.customerId, input.customerId),
          eq(emiSchedules.businessId, user.businessId),
          ne(emiPayments.status, 'paid'),
        ),
      );
    if (
      Number(input.amount) >
      round2(
        Number(customer.outstandingBalance) -
          Number(finance?.amount ?? 0) -
          (await unpaidOrderDebt(tx, user.businessId, input.customerId)) / 100,
      )
    ) {
      throw new Error(
        'amount includes EMI principal or order bills; record their payments in the EMI schedule or order ledger',
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
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, user.businessId)));

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
    await requirePermission(user, 'manage_suppliers');
    // 1. Fetch the supplier row
    const [supplier] = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)))
      .for('update');

    // 2. Guard: supplier must exist in this business
    if (!supplier) throw new Error('supplier not found');

    // 3. Guard: amount must be positive
    if (Number(input.amount) <= 0) throw new Error('amount must be greater than zero');

    // The ledger has no advance-credit account: reject excess instead of losing it.
    if (Number(input.amount) > Number(supplier.outstandingBalance)) {
      throw new Error('amount exceeds outstanding balance');
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
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.businessId, user.businessId)));

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
