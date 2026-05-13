'use server';

import { safeAction } from '@/lib/server-action';
import { auditLogs, customers, emiPayments, emiSchedules } from '@mybizone/db';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const uuid = z.string().uuid();
const moneyText = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'expected money up to 2dp');
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const RecordEmiPaymentInput = z.object({
  paymentId: uuid,
  scheduleId: uuid,
  amountPaid: moneyText,
  paidDate: dateText,
  paymentMethod: z.enum(['cash', 'upi', 'card_debit', 'card_credit', 'cheque', 'other']),
  notes: z.string().max(500).optional().transform((v) => v?.trim() || null),
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
      .where(
        and(eq(emiPayments.id, input.paymentId), eq(emiPayments.businessId, user.businessId)),
      );

    // Decrement the linked customer's outstanding (the EMI principal increased it on sale).
    const [schedule] = await tx
      .select({ customerId: emiSchedules.customerId })
      .from(emiSchedules)
      .where(
        and(
          eq(emiSchedules.id, input.scheduleId),
          eq(emiSchedules.businessId, user.businessId),
        ),
      );
    if (schedule?.customerId) {
      await tx
        .update(customers)
        .set({
          outstandingBalance: sql`GREATEST(${customers.outstandingBalance} - ${input.amountPaid}::numeric, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customers.id, schedule.customerId),
            eq(customers.businessId, user.businessId),
          ),
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
          eq(emiPayments.status, 'pending'),
        ),
      );
    if (remaining.length === 0) {
      await tx
        .update(emiSchedules)
        .set({ status: 'completed' })
        .where(
          and(
            eq(emiSchedules.id, input.scheduleId),
            eq(emiSchedules.businessId, user.businessId),
          ),
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
