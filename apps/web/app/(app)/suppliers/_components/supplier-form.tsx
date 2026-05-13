'use client';

import { UpgradeAlert } from '@/components/upgrade-alert';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupplierAction, updateSupplierAction } from '../actions';

interface Props {
  mode: 'create' | 'edit';
  initial?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    address: string | null;
    outstandingBalance: string;
  };
}

export function SupplierForm({ mode, initial }: Props) {
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
    };
    const result =
      mode === 'create'
        ? await createSupplierAction(payload)
        : await updateSupplierAction({ ...payload, id: initial!.id });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({
      title: mode === 'create' ? 'Supplier created' : 'Supplier updated',
      description: result.data.name,
    });
    router.push('/suppliers');
    router.refresh();
  }

  const submitLabel = mode === 'create' ? 'Create supplier' : 'Save changes';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'New supplier' : 'Edit supplier'}</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={initial?.name ?? ''}
              placeholder="Supplier name"
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
              maxLength={254}
              defaultValue={initial?.email ?? ''}
              placeholder="supplier@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN (GST number) (optional)</Label>
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
              placeholder="Street, City, State — PIN"
            />
          </div>

          {mode === 'edit' && initial && (
            <p className="text-sm text-muted-foreground">
              Outstanding balance:{' '}
              <span className="font-medium">
                ₹{Number(initial.outstandingBalance).toFixed(2)}
              </span>
            </p>
          )}

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
