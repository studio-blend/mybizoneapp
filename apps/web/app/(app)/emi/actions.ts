'use server';

import { requirePermission } from '@/lib/require-permission';
import { safeAction } from '@/lib/server-action';
import { auditLogs, customers, emiPayments, emiSchedules, sales } from '@mybizone/db';
import { instalmentPrincipal } from '@mybizone/domain/emi';
import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v3';

const uuid = z.string().uuid();
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const RecordEmiPaymentInput = z.object({
  paymentId: uuid,
  scheduleId: uuid,
  amountPaid: moneyText.refine((v) => Number(v) > 0, 'amount must be positive'),
  paidDate: dateText,
  paymentMethod: z.enum(['cash', 'upi', 'card_debit', 'card_credit', 'cheque', 'other']),
  notes: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || null),
});

/**
 * Record a single EMI instalment payment. The transaction:
 *   1. Verifies the payment row belongs to the schedule (and the tenant via RLS).
 *   2. Marks the payment row 'paid' with paidDate + amountPaid + paymentMethod.
 *   3. Decrements the linked customer's outstandingBalance (if customer is set).
 *   4. If every payment in the schedule is now 'paid', flips schedule.status to 'completed'.
 *   5. Writes an audit_log.
 */
export const recordEmiPaymentAction = safeAction(
  RecordEmiPaymentInput,
  async (input, { user, tx }) => {
    await requirePermission(user, 'manage_customers');
    // Serialize every payment for this schedule: prevents double collection and
    // makes the final-instalment completion check observe previous payments.
    const [schedule] = await tx
      .select()
      .from(emiSchedules)
      .where(
        and(eq(emiSchedules.id, input.scheduleId), eq(emiSchedules.businessId, user.businessId)),
      )
      .for('update');
    if (!schedule || schedule.status !== 'active') throw new Error('active EMI schedule not found');
    if (Number(input.amountPaid) !== Number(schedule.emiAmount)) {
      throw new Error('record the full scheduled instalment amount');
    }
    const [payment] = await tx
      .select({
        id: emiPayments.id,
        emiScheduleId: emiPayments.emiScheduleId,
        status: emiPayments.status,
        instalmentNumber: emiPayments.instalmentNumber,
      })
      .from(emiPayments)
      .where(
        and(
          eq(emiPayments.id, input.paymentId),
          eq(emiPayments.businessId, user.businessId),
          eq(emiPayments.emiScheduleId, input.scheduleId),
        ),
      );
    if (!payment) throw new Error('emi payment not found');
    if (payment.status === 'paid') throw new Error('payment already recorded');

    await tx
      .update(emiPayments)
      .set({
        status: 'paid',
        paidDate: input.paidDate,
        amountPaid: input.amountPaid,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      })
      .where(and(eq(emiPayments.id, input.paymentId), eq(emiPayments.businessId, user.businessId)));

    // Decrement the linked customer's outstanding (the EMI principal increased it on sale).
    const principalPaid = instalmentPrincipal(
      Number(schedule.principalAmount),
      Number(schedule.downPayment),
      schedule.tenureMonths,
      payment.instalmentNumber,
    );
    if (schedule.customerId) {
      await tx
        .update(customers)
        .set({
          outstandingBalance: sql`GREATEST(${customers.outstandingBalance} - ${principalPaid.toFixed(2)}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(customers.id, schedule.customerId), eq(customers.businessId, user.businessId)),
        );
    }

    // If all instalments are paid, mark schedule completed.
    const remaining = await tx
      .select({ id: emiPayments.id })
      .from(emiPayments)
      .where(
        and(
          eq(emiPayments.emiScheduleId, input.scheduleId),
          eq(emiPayments.businessId, user.businessId),
          ne(emiPayments.status, 'paid'),
        ),
      );
    if (remaining.length === 0) {
      if (schedule.saleId) {
        await tx
          .update(sales)
          .set({ paymentStatus: 'paid', updatedAt: new Date() })
          .where(and(eq(sales.id, schedule.saleId), eq(sales.businessId, user.businessId)));
      }
      await tx
        .update(emiSchedules)
        .set({ status: 'completed' })
        .where(
          and(eq(emiSchedules.id, input.scheduleId), eq(emiSchedules.businessId, user.businessId)),
        );
    }

    await tx.insert(auditLogs).values({
      businessId: user.businessId,
      actorId: user.id,
      action: 'emi.payment.record',
      entity: 'emi_payment',
      entityId: input.paymentId,
      after: {
        scheduleId: input.scheduleId,
        instalment: payment.instalmentNumber,
        amount: input.amountPaid,
      },
    });

    revalidatePath('/emi');
    revalidatePath(`/emi/${input.scheduleId}`);
    revalidatePath('/customers');
    return { ok: true };
  },
);
