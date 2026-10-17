'use client';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useEffect, useState } from 'react';
import { archivePackAction, createPackAction } from './actions';
export function CreatePackForm({
  products,
}: {
  products: { id: string; name: string; unitSymbol: string; unitType: string; store: string }[];
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [productId, setProduct] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setReady(true), []);
  const product = products.find((p) => p.id === productId);
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setError('');
        try {
          const result = await createPackAction({
            id,
            productId,
            name: fd.get('name'),
            qtyPerPack: fd.get('qtyPerPack'),
          });
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          window.location.reload();
        } catch {
          setError(
            'Could not confirm the save. Retry this form; its request ID prevents a duplicate pack.',
          );
          setPending(false);
        }
      }}
    >
      <fieldset disabled={!ready || pending} className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pack-product">Product to pack</Label>
          <Select
            id="pack-product"
            required
            value={productId}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">Choose product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.store} · {p.unitSymbol}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pack-name">Pack name</Label>
            <Input
              id="pack-name"
              name="name"
              required
              maxLength={60}
              placeholder="Carton, case, 500g bag…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pack-size">
              Stock units per pack{product ? ` (${product.unitSymbol})` : ''}
            </Label>
            <Input
              id="pack-size"
              name="qtyPerPack"
              type="number"
              required
              min={product?.unitType === 'piece' ? 1 : 0.001}
              step={product?.unitType === 'piece' ? 1 : 0.001}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Define a conversion, such as 12 pc per carton or 0.5 kg per bag. Stock and prices remain
          in the product's base unit. Archive a definition to replace it; saved documents keep their
          original conversion.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={!products.length || !ready || pending}>
          {pending ? 'Saving…' : 'Create pack definition'}
        </Button>
      </fieldset>
    </form>
  );
}
export function ArchivePackButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const result = await archivePackAction({ id });
            if (!result.ok) {
              setError(result.error);
              setPending(false);
              return;
            }
            window.location.reload();
          } catch {
            setError('Could not confirm archive. Refresh and retry.');
            setPending(false);
          }
        }}
      >
        {pending ? 'Saving…' : 'Archive pack'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
