'use client';

import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useRef, useState } from 'react';
import { enableBatchTrackingAction, reviewBatchAction } from './actions';

type Product = { id: string; name: string; inventory: string; unitSymbol: string; store: string };
export function EnableBatchesForm({ products }: { products: Product[] }) {
  const counter = useRef(1);
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState([
    { key: 0, code: '', qty: '', expiresOn: '', quarantine: false },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const product = products.find((item) => item.id === productId);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError('');
        const result = await enableBatchTrackingAction({
          productId,
          batches: Number(product?.inventory) === 0 ? [] : rows,
        });
        setPending(false);
        if (!result.ok) return setError(result.error);
        setProductId('');
        setRows([{ key: counter.current++, code: '', qty: '', expiresOn: '', quarantine: false }]);
        window.location.assign(`/inventory/batches?productId=${result.data.id}`);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="batch-product">Product to reconcile</Label>
        <Select
          id="batch-product"
          required
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Select a product</option>
          {products.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} · {item.store}
            </option>
          ))}
        </Select>
        {product && (
          <p className="text-sm">
            Current stock:{' '}
            <strong>
              {product.inventory} {product.unitSymbol}
            </strong>
            . Enter each physical lot below. Unknown expiry belongs in quarantine.
          </p>
        )}
      </div>
      {product &&
        Number(product.inventory) > 0 &&
        rows.map((row) => {
          const change = (patch: Partial<typeof row>) =>
            setRows((previous) =>
              previous.map((item) => (item.key === row.key ? { ...item, ...patch } : item)),
            );
          return (
            <fieldset
              key={row.key}
              className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-3"
            >
              <legend className="px-1 text-sm font-medium">Opening lot</legend>
              <div className="space-y-1">
                <Label htmlFor={`code-${row.key}`}>Batch code</Label>
                <Input
                  id={`code-${row.key}`}
                  required
                  maxLength={80}
                  value={row.code}
                  onChange={(e) => change({ code: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`quantity-${row.key}`}>Quantity ({product.unitSymbol})</Label>
                <Input
                  id={`quantity-${row.key}`}
                  required
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(e) => change({ qty: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`expiry-${row.key}`}>Expiry date</Label>
                <Input
                  id={`expiry-${row.key}`}
                  type="date"
                  required={!row.quarantine}
                  value={row.expiresOn}
                  onChange={(e) => change({ expiresOn: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={row.quarantine}
                  onChange={(e) => change({ quarantine: e.target.checked })}
                />
                Quarantine this lot
              </label>
              <Button
                type="button"
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
              >
                Remove lot
              </Button>
            </fieldset>
          );
        })}
      {product && Number(product.inventory) > 0 && (
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= 100}
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { key: counter.current++, code: '', qty: '', expiresOn: '', quarantine: false },
            ])
          }
        >
          Add opening lot
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Enabling tracking requires all stock to match the counted lots. Future receipts require a
        batch and expiry. Use purchases, returns and damage for stock changes.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !product}>
        {pending ? 'Reconciling…' : 'Reconcile and enable tracking'}
      </Button>
    </form>
  );
}

export function ReviewBatchForm({
  batch,
}: { batch: { id: string; code: string; expiresOn: string | null; state: string } }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const release = batch.state === 'quarantine';
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
        {release ? 'Inspect and release' : 'Quarantine lot'}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          setPending(true);
          setError('');
          const result = await reviewBatchAction({
            batchId: batch.id,
            decision: release ? 'release' : 'hold',
            code: fd.get('code') || undefined,
            expiresOn: fd.get('expiresOn') || undefined,
            note: fd.get('note'),
          });
          setPending(false);
          if (!result.ok) return setError(result.error);
          window.location.reload();
        }}
      >
        {release && (
          <>
            <Label className="block">
              Verified lot code
              <Input
                name="code"
                required
                maxLength={80}
                defaultValue={batch.code}
                readOnly={!!batch.expiresOn}
              />
            </Label>
            <Label className="block">
              Verified expiry
              <Input
                name="expiresOn"
                type="date"
                required
                defaultValue={batch.expiresOn ?? ''}
                readOnly={!!batch.expiresOn}
              />
            </Label>
            <p className="text-xs text-muted-foreground">
              Confirm the physical stock is suitable for sale. Retain known lot details; returned
              stock needs a unique inspection code.
            </p>
          </>
        )}
        <Label className="block">
          Inspection note
          <Input name="note" required minLength={3} maxLength={500} />
        </Label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="sm" disabled={pending}>
          {pending ? 'Saving…' : release ? 'Release inspected stock' : 'Quarantine stock'}
        </Button>
      </form>
    </details>
  );
}
