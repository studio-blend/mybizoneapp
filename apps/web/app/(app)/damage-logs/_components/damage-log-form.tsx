'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createDamageLogAction } from '../actions';

interface Product {
  id: string;
  name: string;
  unitSymbol: string;
  inventory: string | null;
  costPrice: string | null;
}

interface Props {
  products: Product[];
}

const REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'theft', label: 'Theft' },
  { value: 'spillage', label: 'Spillage' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' },
] as const;

export function DamageLogForm({ products }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState('');

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const estimatedLoss =
    selectedProduct?.costPrice && qty && /^\d{1,9}(?:\.\d{1,3})?$/.test(qty)
      ? (Number(qty) * Number(selectedProduct.costPrice)).toFixed(2)
      : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      productId: fd.get('productId'),
      qty: fd.get('qty'),
      reason: fd.get('reason'),
      notes: fd.get('notes'),
    };
    const result = await createDamageLogAction(payload);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Damage logged', description: 'Inventory updated.' });
    router.push('/damage-logs');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log damage</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="productId">Product</Label>
            <Select
              id="productId"
              name="productId"
              required
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (stock: {p.inventory ?? '—'} {p.unitSymbol})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qty">Quantity</Label>
            <Input
              id="qty"
              name="qty"
              type="text"
              inputMode="decimal"
              required
              placeholder="e.g. 5 or 2.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            {estimatedLoss !== null && (
              <p className="text-sm text-muted-foreground">
                Estimated loss: ₹{estimatedLoss}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select id="reason" name="reason" required defaultValue="">
              <option value="" disabled>
                Select reason…
              </option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" maxLength={500} placeholder="Additional details…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Log damage'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
