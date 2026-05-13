'use client';

import { Button } from '@mybizone/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useState } from 'react';
import { createSalesSettlementAction } from '../actions';

interface Props {
  customers: {
    id: string;
    name: string;
    phone: string | null;
    outstandingBalance: string;
  }[];
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
] as const;

export function SalesSettlementForm({ customers }: Props) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  // Sort customers by outstandingBalance descending
  const sorted = [...customers].sort(
    (a, b) => Number(b.outstandingBalance) - Number(a.outstandingBalance),
  );

  function handleCustomerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = customers.find((c) => c.id === e.target.value);
    if (selected) {
      setAmount(Number(selected.outstandingBalance) > 0 ? selected.outstandingBalance : '');
    } else {
      setAmount('');
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);
    const customerId = fd.get('customerId') as string;
    const payload = {
      customerId,
      amount: fd.get('amount') as string,
      paymentMethod: fd.get('paymentMethod') as string,
      referenceNo: (fd.get('referenceNo') as string) || undefined,
      notes: (fd.get('notes') as string) || undefined,
    };

    const result = await createSalesSettlementAction(payload);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const customerName = customers.find((c) => c.id === customerId)?.name ?? '';
    toast({
      title: 'Settlement recorded',
      description: `₹${Number(result.data.amount).toFixed(2)} from ${customerName}`,
    });

    // Reset form
    setAmount('');
    setError(null);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record sales settlement</CardTitle>
        <CardDescription>
          Record a payment received from a customer against their outstanding balance.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customerId">Customer</Label>
            <Select
              id="customerId"
              name="customerId"
              required
              onChange={handleCustomerChange}
            >
              <option value="">Select a customer…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — ₹{Number(c.outstandingBalance).toFixed(2)} due
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount ₹</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              pattern="^\d{1,10}(?:\.\d{1,2})?$"
              placeholder="0.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <Select id="paymentMethod" name="paymentMethod" required defaultValue="cash">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referenceNo">Reference no. (optional)</Label>
            <Input
              id="referenceNo"
              name="referenceNo"
              maxLength={100}
              placeholder="UPI ref / cheque no / card last 4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={500}
              placeholder="Any additional notes"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Recording…' : 'Record settlement'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
