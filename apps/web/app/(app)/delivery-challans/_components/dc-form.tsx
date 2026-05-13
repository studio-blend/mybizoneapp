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
import { createDcAction } from '../actions';

interface Product {
  id: string;
  name: string;
  price: string;
  unitSymbol: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  products: Product[];
  customers: Customer[];
}

interface LineItem {
  id: number;
  productId: string;
  qty: string;
  unitPrice: string;
}

let lineCounter = 0;

function newLine(): LineItem {
  return { id: ++lineCounter, productId: '', qty: '', unitPrice: '' };
}

export function DcForm({ products, customers }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  const productById = new Map(products.map((p) => [p.id, p]));

  function updateLine(id: number, patch: Partial<LineItem>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        if (patch.productId !== undefined) {
          const p = productById.get(patch.productId);
          updated.unitPrice = p ? p.price : '';
        }
        return updated;
      }),
    );
  }

  function removeLine(id: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  const runningTotal = lines.reduce((acc, l) => {
    const qty = parseFloat(l.qty);
    const price = parseFloat(l.unitPrice);
    if (!Number.isNaN(qty) && !Number.isNaN(price)) return acc + qty * price;
    return acc;
  }, 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      customerId: fd.get('customerId') as string,
      customerName: fd.get('customerName') as string,
      customerPhone: fd.get('customerPhone') as string,
      notes: fd.get('notes') as string,
      items: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
    };

    const result = await createDcAction(payload);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Delivery challan created', description: result.data.dcNo });
    router.push('/delivery-challans');
    router.refresh();
  }

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Delivery Challan</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-6">
          {/* Customer */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer</Label>
              <Select
                id="customerId"
                name="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Walk-in / unnamed</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            {!customerId && (
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer name</Label>
                <Input
                  id="customerName"
                  name="customerName"
                  maxLength={120}
                  placeholder="Name (optional)"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone (optional)</Label>
              <Input
                id="customerPhone"
                name="customerPhone"
                type="tel"
                maxLength={30}
                defaultValue={selectedCustomer?.phone ?? ''}
                placeholder="10-digit number"
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <Label>Items</Label>
            {lines.map((line) => {
              const lineTotal =
                line.qty && line.unitPrice
                  ? (parseFloat(line.qty) * parseFloat(line.unitPrice)).toFixed(2)
                  : '—';
              return (
                <div key={line.id} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
                  <Select
                    required
                    value={line.productId}
                    onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    required
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={line.qty}
                    onChange={(e) => updateLine(line.id, { qty: e.target.value })}
                  />
                  <Input
                    required
                    type="text"
                    inputMode="decimal"
                    placeholder="Unit price"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                  />
                  <span className="flex items-center text-sm text-muted-foreground min-w-[80px]">
                    ₹{lineTotal}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length === 1}
                  >
                    ✕
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              + Add item
            </Button>
          </div>

          {/* Total */}
          <div className="flex justify-end text-lg font-semibold">
            Total: ₹{runningTotal.toFixed(2)}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" maxLength={500} placeholder="Dispatch instructions…" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating…' : 'Create delivery challan'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
