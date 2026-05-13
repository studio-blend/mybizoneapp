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
import { createPurchaseAction } from '../actions';

interface Product {
  id: string;
  name: string;
  price: string;
  unitSymbol: string;
}

interface Supplier {
  id: string;
  name: string;
  outstandingBalance: string;
}

interface Props {
  products: Product[];
  suppliers: Supplier[];
  defaultSupplierId?: string;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseForm({ products, suppliers, defaultSupplierId = '' }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [supplierName, setSupplierName] = useState(() => {
    if (defaultSupplierId) {
      return suppliers.find((s) => s.id === defaultSupplierId)?.name ?? '';
    }
    return '';
  });
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;

  function handleSupplierChange(id: string) {
    setSupplierId(id);
    const s = suppliers.find((sup) => sup.id === id);
    if (s) setSupplierName(s.name);
    else if (!id) setSupplierName('');
  }

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
      supplierId: supplierId || '',
      supplierName: supplierName,
      purchaseDate: fd.get('purchaseDate') as string,
      paymentMethod: fd.get('paymentMethod') as string,
      notes: fd.get('notes') as string,
      items: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
    };

    const result = await createPurchaseAction(payload);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Purchase bill created', description: result.data.billNo });
    router.push('/purchases');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Purchase Bill</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-6">
          {/* Supplier */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplierId">Supplier (optional)</Label>
              <Select
                id="supplierId"
                name="supplierId"
                value={supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
              >
                <option value="">Walk-in / unnamed</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {Number(s.outstandingBalance) > 0
                      ? ` — ₹${Number(s.outstandingBalance).toFixed(2)} due`
                      : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierName">Supplier name</Label>
              <Input
                id="supplierName"
                name="supplierName"
                maxLength={120}
                required
                placeholder="Supplier name"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
          </div>

          {/* Date & Payment */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input
                id="purchaseDate"
                name="purchaseDate"
                type="date"
                defaultValue={todayIso()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment method</Label>
              <Select id="paymentMethod" name="paymentMethod" defaultValue="cash">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="credit">Credit</option>
                <option value="other">Other</option>
              </Select>
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
              const selectedProduct = productById.get(line.productId);
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
                    placeholder={`Qty${selectedProduct ? ` (${selectedProduct.unitSymbol})` : ''}`}
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

          {/* Running total */}
          <div className="flex justify-end text-lg font-semibold">
            Total: ₹{runningTotal.toFixed(2)}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={500}
              placeholder="Invoice reference, remarks…"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating…' : 'Create purchase bill'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
