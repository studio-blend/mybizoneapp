'use client';

import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setSupplierOpeningBalanceAction } from '../actions';

interface Props {
  supplierId: string;
  financialYear: string;
  current: string;
  notes: string;
}

export function SupplierOpeningBalanceForm({ supplierId, financialYear, current, notes }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [amount, setAmount] = useState(current);
  const [noteText, setNoteText] = useState(notes);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const result = await setSupplierOpeningBalanceAction({
      supplierId,
      financialYear,
      amount,
      notes: noteText,
    });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Opening balance saved', description: `FY ${financialYear}: ₹${amount}` });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="ob-amount">Amount (₹)</Label>
          <Input
            id="ob-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-36"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="ob-notes">Notes (optional)</Label>
          <Textarea
            id="ob-notes"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. balance from old ledger"
            rows={1}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
