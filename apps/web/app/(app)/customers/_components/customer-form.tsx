'use client';

import { UpgradeAlert } from '@/components/upgrade-alert';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createCustomerAction, updateCustomerAction } from '../actions';

interface Props {
  mode: 'create' | 'edit';
  initial?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    address: string | null;
    rateCategory: string;
    creditLimit: string;
    outstandingBalance: string;
  };
}

const RATE_CATEGORIES = [
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'mrp', label: 'MRP' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'rate1', label: 'Rate 1' },
  { value: 'rate2', label: 'Rate 2' },
  { value: 'rate3', label: 'Rate 3' },
  { value: 'rate4', label: 'Rate 4' },
] as const;

export function CustomerForm({ mode, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name') as string,
      phone: fd.get('phone') as string,
      email: fd.get('email') as string,
      gstin: fd.get('gstin') as string,
      address: fd.get('address') as string,
      rateCategory: fd.get('rateCategory') as string,
      creditLimit: fd.get('creditLimit') as string,
    };

    const result =
      mode === 'create'
        ? await createCustomerAction(payload)
        : await updateCustomerAction({ ...payload, id: initial!.id });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast({
      title: mode === 'create' ? 'Customer created' : 'Customer updated',
      description: result.data.name,
    });
    router.push('/customers');
    router.refresh();
  }

  const title = mode === 'create' ? 'New customer' : 'Edit customer';
  const submitLabel = mode === 'create' ? 'Create customer' : 'Save changes';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Customer details for billing and credit management.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={initial?.name ?? ''}
              placeholder="Customer name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              maxLength={30}
              defaultValue={initial?.phone ?? ''}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              maxLength={120}
              defaultValue={initial?.email ?? ''}
              placeholder="customer@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN (optional)</Label>
            <Input
              id="gstin"
              name="gstin"
              maxLength={20}
              defaultValue={initial?.gstin ?? ''}
              placeholder="22AAAAA0000A1Z5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address (optional)</Label>
            <Textarea
              id="address"
              name="address"
              maxLength={500}
              defaultValue={initial?.address ?? ''}
              placeholder="Street, city, state, pincode"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rateCategory">Rate category</Label>
            <Select
              id="rateCategory"
              name="rateCategory"
              defaultValue={initial?.rateCategory ?? 'retail'}
            >
              {RATE_CATEGORIES.map((rc) => (
                <option key={rc.value} value={rc.value}>
                  {rc.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="creditLimit">Credit Limit ₹</Label>
            <Input
              id="creditLimit"
              name="creditLimit"
              inputMode="decimal"
              pattern="^\d{1,10}(?:\.\d{1,2})?$"
              defaultValue={initial?.creditLimit ?? '0'}
              placeholder="0"
            />
            {mode === 'edit' && initial && (
              <p className="text-xs text-muted-foreground">
                Outstanding balance: ₹{initial.outstandingBalance}
              </p>
            )}
          </div>

          <UpgradeAlert error={error} />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
