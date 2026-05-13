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
import { createPurchaseReturnAction } from '../actions';

interface Props {
  products: {
    id: string;
    name: string;
    price: string;
    unitSymbol: string;
  }[];
  suppliers: {
    id: string;
    name: string;
    outstandingBalance: string;
  }[];
}

interface ItemRow {
  productId: string;
  qty: string;
}

export function PurchaseReturnForm({ products, suppliers }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originalBillNo, setOriginalBillNo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [reason, setReason] = useState('');

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

  // Compute running total from selected products + qty
  const runningTotal = items.reduce((acc, row) => {
    const p = products.find((pr) => pr.id === row.productId);
    if (!p || !row.qty) return acc;
    const qty = parseFloat(row.qty);
    if (Number.isNaN(qty)) return acc;
    return acc + qty * parseFloat(p.price);
  }, 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((it) => it.productId && it.qty);
    if (validItems.length === 0) {
      setError('Add at least one item to return.');
      return;
    }

    setPending(true);

    const result = await createPurchaseReturnAction({
      supplierId: supplierId || undefined,
      supplierName: supplierName || undefined,
      reason: reason || undefined,
      items: validItems.map((it) => ({ productId: it.productId, qty: it.qty })),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast({
      title: 'Purchase return created',
      description: `${result.data.returnNo} — ₹${result.data.total}`,
    });
    router.push('/purchase-returns');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Return details */}
      <Card>
        <CardHeader>
          <CardTitle>Return details</CardTitle>
          <CardDescription>
            Optionally link to the original purchase bill and select the supplier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="originalBillNo">Original purchase bill number (optional)</Label>
            <Input
              id="originalBillNo"
              name="originalBillNo"
              maxLength={40}
              placeholder="PUR-2526-0001"
              value={originalBillNo}
              onChange={(e) => setOriginalBillNo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplierId">Supplier (optional)</Label>
            <Select
              id="supplierId"
              name="supplierId"
              value={supplierId}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                setSupplierId(val);
                if (val) {
                  const found = suppliers.find((s) => s.id === val);
                  if (found) setSupplierName(found.name);
                } else {
                  setSupplierName('');
                }
              }}
            >
              <option value="">— no supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (outstanding: ₹{s.outstandingBalance})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplierName">Supplier name (optional)</Label>
            <Input
              id="supplierName"
              name="supplierName"
              maxLength={120}
              placeholder="Supplier name"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={500}
              placeholder="Wrong item, defective, overstock, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items to return */}
      <Card>
        <CardHeader>
          <CardTitle>Items to return</CardTitle>
          <CardDescription>
            Select each product being returned to the supplier and enter the quantity.
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

          {runningTotal > 0 && (
            <p className="text-sm font-medium text-right">
              Total: ₹{runningTotal.toFixed(2)}
            </p>
          )}
        </CardContent>

        {error && (
          <div className="px-6 pb-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating return…' : 'Create purchase return'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
