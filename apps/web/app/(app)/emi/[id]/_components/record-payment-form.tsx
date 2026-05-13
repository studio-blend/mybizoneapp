'use client';

import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { recordEmiPaymentAction } from '../../actions';

interface Props {
  paymentId: string;
  scheduleId: string;
  defaultAmount: string;
}

export function RecordPaymentForm({ paymentId, scheduleId, defaultAmount }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<
    'cash' | 'upi' | 'card_debit' | 'card_credit' | 'cheque' | 'other'
  >('cash');
  const [notes, setNotes] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await recordEmiPaymentAction({
      paymentId,
      scheduleId,
      amountPaid: amount,
      paidDate,
      paymentMethod,
      notes,
    });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Payment recorded', description: `₹${amount}` });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Record payment
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="w-24"
        placeholder="Amount"
      />
      <Input
        type="date"
        value={paidDate}
        onChange={(e) => setPaidDate(e.target.value)}
        className="w-36"
      />
      <Select
        value={paymentMethod}
        onChange={(e) =>
          setPaymentMethod(
            e.target.value as 'cash' | 'upi' | 'card_debit' | 'card_credit' | 'cheque' | 'other',
          )
        }
        className="w-28"
      >
        <option value="cash">Cash</option>
        <option value="upi">UPI</option>
        <option value="card_debit">Debit card</option>
        <option value="card_credit">Credit card</option>
        <option value="cheque">Cheque</option>
        <option value="other">Other</option>
      </Select>
      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="w-32"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? '…' : 'Save'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
