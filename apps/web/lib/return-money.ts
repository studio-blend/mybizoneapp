import type { OrderTx } from './order-ledger';
import { centsText, moneyCents } from './order-policy';
import { type SettlementSide, settlementBillBalance } from './settlement-ledger';
export async function returnMoneySnapshot(
  tx: OrderTx,
  businessId: string,
  side: SettlementSide,
  bill: { id: string; paymentMethod: string; paymentStatus?: string },
  total: string,
  allowRefundDue: boolean,
) {
  if (bill.paymentMethod === 'order') return { debtReductionAmount: null, refundDueAmount: null };
  const value = moneyCents(total);
  if (bill.paymentMethod === 'credit') {
    const balance = await settlementBillBalance(tx, businessId, side, bill.id);
    if (balance.unreconciledStatus)
      throw new Error(
        'Credit bill payment history needs allocation reconciliation before adjusting debt',
      );
    if (value > balance.remaining && !allowRefundDue)
      throw new Error(
        'Credit return exceeds unpaid bill value; record the paid portion as refund due',
      );
    const reduction = Math.min(value, balance.remaining);
    return {
      debtReductionAmount: centsText(reduction),
      refundDueAmount: centsText(value - reduction),
    };
  }
  if (
    ![
      'cash',
      'upi',
      'card',
      'card_debit',
      'card_credit',
      'bank',
      'bank_transfer',
      'cheque',
      'other',
    ].includes(bill.paymentMethod)
  )
    throw new Error('Original payment needs reconciliation before recording refund entitlement');
  if (side === 'sales' && bill.paymentStatus !== 'paid')
    return { debtReductionAmount: null, refundDueAmount: null };
  return { debtReductionAmount: '0.00', refundDueAmount: total };
}
