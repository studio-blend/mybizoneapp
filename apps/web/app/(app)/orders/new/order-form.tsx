'use client';
import { calculateSaleTotals } from '@mybizone/domain/sale';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useEffect, useState } from 'react';
import { createOrderAction } from '../actions';
type Product = {
  id: string;
  name: string;
  storeId: string;
  unitType: string;
  unitSymbol: string;
  price: string;
  gstRate: string | null;
};
type Line = { key: string; productId: string; qty: string; unitPrice: string };
export function OrderForm({
  stores,
  customers,
  products,
  gstEnabled,
}: {
  stores: { id: string; name: string }[];
  customers: { id: string; name: string; address: string | null }[];
  products: Product[];
  gstEnabled: boolean;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [address, setAddress] = useState('');
  const [billType, setBillType] = useState(gstEnabled ? 'gst_bill' : 'non_gst_bill');
  const [interstate, setInterstate] = useState(false);
  const fresh = (): Line => ({ key: crypto.randomUUID(), productId: '', qty: '1', unitPrice: '' });
  const [lines, setLines] = useState<Line[]>([
    { key: 'initial-item', productId: '', qty: '1', unitPrice: '' },
  ]);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState('');
  const edit = (key: string, patch: Partial<Line>) =>
    setLines((old) => old.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  let total: string | null = null;
  try {
    if (lines.every((l) => l.productId && l.qty.trim() && l.unitPrice.trim())) {
      const calc = calculateSaleTotals({
        gstEnabled: gstEnabled && billType === 'gst_bill',
        isInterstate: interstate,
        lines: lines.map((l) => ({
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice),
          gstRate: Number(products.find((p) => p.id === l.productId)?.gstRate ?? 0),
        })),
      });
      total = calc.total.toFixed(2);
    }
  } catch {
    total = null;
  }
  return (
    <form
      method="post"
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        setPending(true);
        setError('');
        try {
          const result = await createOrderAction({
            id,
            storeId,
            customerId,
            deliveryAddress: address,
            promisedOn: fd.get('promisedOn'),
            billType,
            isInterstate: interstate,
            notes: fd.get('notes'),
            items: lines.map(({ productId, qty, unitPrice }) => ({ productId, qty, unitPrice })),
          });
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          window.location.assign(`/orders/${result.data.id}`);
        } catch {
          setPending(false);
          setError(
            'Could not confirm the save. Retry this form; its request ID prevents duplicate orders.',
          );
        }
      }}
    >
      <fieldset disabled={!ready || pending} className="min-w-0 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="order-store">Store</Label>
            <Select
              id="order-store"
              value={storeId}
              required
              onChange={(e) => {
                setStoreId(e.target.value);
                setLines([fresh()]);
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-customer">Registered customer</Label>
            <Select
              id="order-customer"
              required
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setAddress(customers.find((c) => c.id === e.target.value)?.address ?? '');
              }}
            >
              <option value="">Choose customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Label className="block space-y-2">
            Promised handover date
            <Input required name="promisedOn" type="date" />
          </Label>
          <div className="space-y-2">
            <Label htmlFor="order-bill-type">Delivery bill type</Label>
            <Select
              id="order-bill-type"
              value={billType}
              onChange={(e) => setBillType(e.target.value)}
            >
              <option value="non_gst_bill">Non-GST Bill</option>
              {gstEnabled && <option value="gst_bill">GST Bill</option>}
            </Select>
          </div>
          <Label className="block space-y-2 sm:col-span-2">
            Delivery address
            <Textarea
              required
              maxLength={1000}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Label>
        </div>
        {billType === 'gst_bill' && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={interstate}
              onChange={(e) => setInterstate(e.target.checked)}
            />
            Interstate delivery (IGST)
          </label>
        )}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Agreed products and prices</h2>
          {lines.map((line, index) => {
            const product = products.find((p) => p.id === line.productId);
            return (
              <fieldset
                key={line.key}
                className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2"
              >
                <legend className="px-1 text-sm font-medium">Order item {index + 1}</legend>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`order-product-${line.key}`}>Product</Label>
                  <Select
                    id={`order-product-${line.key}`}
                    required
                    value={line.productId}
                    onChange={(e) => {
                      const p = products.find((p) => p.id === e.target.value);
                      edit(line.key, { productId: e.target.value, unitPrice: p?.price ?? '' });
                    }}
                  >
                    <option value="">Choose product</option>
                    {products
                      .filter((p) => p.storeId === storeId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.unitSymbol}
                        </option>
                      ))}
                  </Select>
                </div>
                <Label className="block space-y-2">
                  Quantity{product ? ` (${product.unitSymbol})` : ''}
                  <Input
                    required
                    type="number"
                    min={product?.unitType === 'piece' ? 1 : 0.001}
                    step={product?.unitType === 'piece' ? 1 : 0.001}
                    value={line.qty}
                    onChange={(e) => edit(line.key, { qty: e.target.value })}
                  />
                </Label>
                <Label className="block space-y-2">
                  Agreed unit price (₹)
                  <Input
                    required
                    type="number"
                    min={0}
                    max="99999999.99"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => edit(line.key, { unitPrice: e.target.value })}
                  />
                </Label>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLines((old) => old.filter((l) => l.key !== line.key))}
                  >
                    Remove item {index + 1}
                  </Button>
                )}
              </fieldset>
            );
          })}
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= 100}
            onClick={() => setLines((old) => [...old, fresh()])}
          >
            Add order item
          </Button>
        </div>
        <Label className="block space-y-2">
          Order notes (optional)
          <Textarea name="notes" maxLength={500} />
        </Label>
        <div className="rounded-xl border p-4">
          <p className="text-lg font-semibold">
            Agreed order value: {total === null ? 'Complete the product lines' : `₹${total}`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This saves an agreement. It does not reserve stock or create a sale. Record actual
            receipts and physical handovers from the saved order. Agreed prices and tax amounts stay
            fixed.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={!ready || pending || !lines.length}>
          {pending ? 'Saving order…' : 'Create customer order'}
        </Button>
      </fieldset>
    </form>
  );
}
