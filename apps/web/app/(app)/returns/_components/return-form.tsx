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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSalesReturnAction } from '../actions';

interface Props {
  products: {
    id: string;
    name: string;
    unitSymbol: string;
    inventory: string;
    price: string;
  }[];
  customers: {
    id: string;
    name: string;
    outstandingBalance: string;
  }[];
  originalSale?: { id: string; billNo: string; customerName: string | null } | null;
}

interface ItemRow {
  productId: string;
  qty: string;
}

export function ReturnForm({ products, customers, originalSale }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [originalBillNo, setOriginalBillNo] = useState(originalSale?.billNo ?? '');
  const [customerName, setCustomerName] = useState(originalSale?.customerName ?? '');
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');

  // Step 2 — item rows
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', qty: '' }]);

  function addItemRow() {
    setItems((prev) => [...prev, { productId: '', qty: '' }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validate items
    const validItems = items.filter((it) => it.productId && it.qty);
    if (validItems.length === 0) {
      setError('Add at least one item to return.');
      return;
    }

    setPending(true);

    const result = await createSalesReturnAction({
      originalSaleId: originalSale?.id ?? undefined,
      customerId: customerId || undefined,
      customerName: customerName || undefined,
      reason: reason || undefined,
      items: validItems.map((it) => ({ productId: it.productId, qty: it.qty })),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast({
      title: 'Return created',
      description: `${result.data.returnNo} — ₹${result.data.total}`,
    });
    router.push('/returns');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Step 1: Return details */}
      <Card>
        <CardHeader>
          <CardTitle>Return details</CardTitle>
          <CardDescription>
            Optionally link to an original bill and provide customer and reason.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="originalBillNo">Original bill number (optional)</Label>
            <Input
              id="originalBillNo"
              name="originalBillNo"
              maxLength={40}
              placeholder="GST-2526-0001"
              value={originalBillNo}
              onChange={(e) => setOriginalBillNo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerId">Customer (optional)</Label>
            <Select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                setCustomerId(val);
                if (val) {
                  const found = customers.find((c) => c.id === val);
                  if (found) setCustomerName(found.name);
                }
              }}
            >
              <option value="">— no customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (outstanding: ₹{c.outstandingBalance})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Customer name (optional)</Label>
            <Input
              id="customerName"
              name="customerName"
              maxLength={120}
              placeholder="Walk-in customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={500}
              placeholder="Damaged product, wrong item, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Items to return */}
      <Card>
        <CardHeader>
          <CardTitle>Items to return</CardTitle>
          <CardDescription>
            Select each product being returned and enter the quantity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`product-${idx}`}>Product</Label>
                <Select
                  id={`product-${idx}`}
                  value={row.productId}
                  onChange={(e) =>
                    updateItem(idx, 'productId', (e.target as HTMLSelectElement).value)
                  }
                >
                  <option value="">— select product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unitSymbol}) — ₹{p.price}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor={`qty-${idx}`}>Qty</Label>
                <Input
                  id={`qty-${idx}`}
                  inputMode="decimal"
                  pattern="^\d{1,9}(?:\.\d{1,3})?$"
                  placeholder="1"
                  value={row.qty}
                  onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                />
              </div>
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItemRow(idx)}
                  className="text-destructive"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
            + Add item
          </Button>
        </CardContent>

        {error && (
          <div className="px-6 pb-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating return…' : 'Create return'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
