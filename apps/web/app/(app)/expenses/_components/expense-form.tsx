'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useState } from 'react';
import { createExpenseEntryAction } from '../actions';

const CATEGORY_SUGGESTIONS = [
  'Rent',
  'Electricity',
  'Water',
  'Salaries',
  'Transport',
  'Maintenance',
  'Petty Cash',
  'Bank Interest',
  'Other',
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
] as const;

function todayIso() {
  return new Date().toISOString().split('T')[0]!;
}

const DEFAULT_STATE = {
  type: 'expense' as 'income' | 'expense',
  category: '',
  amount: '',
  description: '',
  entryDate: todayIso(),
  paymentMethod: 'cash',
  referenceNo: '',
  notes: '',
};

export function ExpenseForm() {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_STATE);

  function set(field: keyof typeof DEFAULT_STATE, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await createExpenseEntryAction({
      type: form.type,
      category: form.category,
      amount: form.amount,
      description: form.description,
      paymentMethod: form.paymentMethod,
      referenceNo: form.referenceNo || undefined,
      notes: form.notes || undefined,
      entryDate: form.entryDate || undefined,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast({ title: 'Entry recorded', description: 'Your ledger entry has been saved.' });
    setForm({ ...DEFAULT_STATE, entryDate: todayIso() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New entry</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              id="type"
              name="type"
              required
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              list="category-suggestions"
              required
              maxLength={60}
              placeholder="e.g. Rent, Electricity…"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              placeholder="e.g. 1500 or 1500.50"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              required
              maxLength={200}
              placeholder="Brief description of this entry"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* Entry Date */}
          <div className="space-y-2">
            <Label htmlFor="entryDate">Date</Label>
            <Input
              id="entryDate"
              name="entryDate"
              type="date"
              required
              value={form.entryDate}
              onChange={(e) => set('entryDate', e.target.value)}
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <Select
              id="paymentMethod"
              name="paymentMethod"
              required
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Reference No (optional) */}
          <div className="space-y-2">
            <Label htmlFor="referenceNo">Reference no. (optional)</Label>
            <Input
              id="referenceNo"
              name="referenceNo"
              maxLength={100}
              placeholder="Cheque no., UTR, invoice ref…"
              value={form.referenceNo}
              onChange={(e) => set('referenceNo', e.target.value)}
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={500}
              placeholder="Additional details…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Record entry'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
