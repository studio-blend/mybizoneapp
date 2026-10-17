'use client';

import { SerialNumbersField } from '@/components/serial-numbers-field';
import { type BatchChoice, StockBatchSelect } from '@/components/stock-batch-select';
import { parseSerialText } from '@/lib/serial-policy';

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
import { useRef, useState } from 'react';
import { createPurchaseReturnAction } from '../actions';

interface Props {
  products: {
    id: string;
    name: string;
    price: string;
    unitSymbol: string;
    batchTracking: boolean;
    serialTracking: boolean;
  }[];
  batches: BatchChoice[];
  suppliers: {
    id: string;
    name: string;
    outstandingBalance: string;
  }[];
}

interface ItemRow {
  rowKey: number;
  productId: string;
  qty: string;
  batchId?: string;
  serialText?: string;
}

export function PurchaseReturnForm({ products, suppliers, batches }: Props) {
  const { toast } = useToast();

  const requestId = useRef('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originalBillNo, setOriginalBillNo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [reason, setReason] = useState('');

  const nextRowKey = useRef(1);
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', qty: '', rowKey: 0 }]);

  function addItemRow() {
    const rowKey = nextRowKey.current++;
    setItems((prev) => [...prev, { productId: '', qty: '', rowKey }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(
    index: number,
    field: 'productId' | 'qty' | 'batchId' | 'serialText',
    value: string,
  ) {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: value,
              ...(field === 'productId' ? { batchId: undefined, serialText: '' } : {}),
            }
          : row,
      ),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((it) => it.productId && it.qty);
    if (validItems.length === 0) {
      setError('Add at least one item to return.');
      return;
    }

    setPending(true);

    const key = requestId.current || crypto.randomUUID();
    requestId.current = key;
    const result = await createPurchaseReturnAction({
      id: key,
      allowRefundDue: true,
      originalBillNo,
      supplierId: supplierId || undefined,
      supplierName: supplierName || undefined,
      reason: reason || undefined,
      items: validItems.map((it) => ({
        productId: it.productId,
        qty: it.qty,
        batchId: it.batchId,
        serialNumbers: parseSerialText(it.serialText ?? ''),
      })),
    }).catch(() => ({
      ok: false as const,
      error: 'Could not confirm the save. Retry this form to check the same request safely.',
    }));

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast({
      title: 'Purchase return created',
      description: `${result.data.returnNo} — ₹${result.data.total}`,
    });
    window.location.assign('/purchase-returns');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Return details */}
      <Card>
        <CardHeader>
          <CardTitle>Return details</CardTitle>
          <CardDescription>
            Link to the original purchase bill and select the supplier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Unpaid value reduces debt. Paid value becomes a refund due; record the actual money
            separately in Advances &amp; refunds.
          </p>
          <div className="space-y-2">
            <Label htmlFor="originalBillNo">Original purchase bill number</Label>
            <Input
              id="originalBillNo"
              required
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
            <div
              key={row.rowKey}
              className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
            >
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
              {products.find((product) => product.id === row.productId)?.serialTracking && (
                <div className="min-w-0 sm:col-span-3">
                  <SerialNumbersField
                    id={`supplier-return-serials-${row.rowKey}`}
                    value={row.serialText ?? ''}
                    onChange={(value) => updateItem(idx, 'serialText', value)}
                  />
                </div>
              )}
              {products.find((product) => product.id === row.productId)?.batchTracking && (
                <div className="sm:col-span-3">
                  <StockBatchSelect
                    id={`return-batch-${row.rowKey}`}
                    batches={batches}
                    productId={row.productId}
                    value={row.batchId ?? ''}
                    onChange={(value) => updateItem(idx, 'batchId', value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    For a tracked receipt, choose a lot received on the original bill. Older bills
                    use the physical lot you select.
                  </p>
                </div>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
            + Add item
          </Button>

          <p className="text-sm text-muted-foreground">
            The refund uses prices and tax from the original bill.
          </p>
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
