'use client';
import { SerialNumbersField } from '@/components/serial-numbers-field';
import { parseSerialText } from '@/lib/serial-policy';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useState } from 'react';
import { configureWarrantyAction, enableSerialTrackingAction, reviewSerialAction } from './actions';

type Product = {
  id: string;
  name: string;
  store: string;
  inventory: string;
  warrantyMonths: number;
  warrantyIssuer: string | null;
};
function WarrantyFields({ product }: { product?: Product }) {
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Terms for future sales</legend>
      <Label className="block">
        Warranty months
        <Input
          name="warrantyMonths"
          type="number"
          min={0}
          max={120}
          step={1}
          required
          defaultValue={product?.warrantyMonths ?? 0}
        />
      </Label>
      <Label className="block">
        Warranty issuer
        <Input
          name="warrantyIssuer"
          maxLength={120}
          defaultValue={product?.warrantyIssuer ?? ''}
          placeholder="Manufacturer or seller"
        />
      </Label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Use the actual terms you offer. Zero means no warranty recorded. Changing these defaults
        affects future bills only; it does not change an older unit’s warranty or establish claim
        eligibility.
      </p>
    </fieldset>
  );
}
export function EnableSerialsForm({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState('');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const product = products.find((item) => item.id === productId);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        setPending(true);
        setError('');
        const result = await enableSerialTrackingAction({
          productId,
          serialNumbers: parseSerialText(text),
          warrantyMonths: Number(fd.get('warrantyMonths')),
          warrantyIssuer: fd.get('warrantyIssuer'),
        });
        if (!result.ok) {
          setPending(false);
          setError(result.error);
          return;
        }
        window.location.assign(`/inventory/serials?productId=${result.data.id}`);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="serial-product">Product to reconcile</Label>
        <Select
          id="serial-product"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setText('');
          }}
        >
          <option value="">Select a product sold by piece</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.store}
            </option>
          ))}
        </Select>
      </div>
      {product && (
        <p className="text-sm">
          Current physical stock: <strong>{product.inventory} pc</strong>. Count and enter each
          physical unit’s serial. Activation changes no stock or financial values.
        </p>
      )}
      <SerialNumbersField
        id="opening-serials"
        value={text}
        onChange={setText}
        required={!!product && Number(product.inventory) > 0}
      />
      <WarrantyFields />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending || !productId}>
        {pending ? 'Reconciling…' : 'Reconcile and enable serial tracking'}
      </Button>
    </form>
  );
}
export function WarrantySettingsForm({ product }: { product: Product }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        setPending(true);
        setError('');
        const result = await configureWarrantyAction({
          productId: product.id,
          warrantyMonths: Number(fd.get('warrantyMonths')),
          warrantyIssuer: fd.get('warrantyIssuer'),
        });
        if (!result.ok) {
          setPending(false);
          setError(result.error);
          return;
        }
        window.location.reload();
      }}
    >
      <WarrantyFields product={product} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending}>{pending ? 'Saving…' : 'Save terms for future sales'}</Button>
    </form>
  );
}
export function ReviewSerialForm({ unit }: { unit: { id: string; state: string } }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const release = unit.state === 'quarantine';
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
        {release ? 'Inspect and release' : 'Quarantine unit'}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          setPending(true);
          setError('');
          const result = await reviewSerialAction({
            serialId: unit.id,
            decision: release ? 'release' : 'hold',
            note: fd.get('note'),
          });
          if (!result.ok) {
            setPending(false);
            setError(result.error);
            return;
          }
          window.location.reload();
        }}
      >
        <Label className="block">
          Inspection note
          <Input name="note" minLength={3} maxLength={500} required />
        </Label>
        <p className="text-xs text-muted-foreground">
          {release
            ? 'Confirm this exact unit is suitable for sale. Its old sale and return history remains recorded.'
            : 'This unit stays in physical stock and is blocked at checkout.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button size="sm" disabled={pending}>
          {pending ? 'Saving…' : release ? 'Release inspected unit' : 'Quarantine unit'}
        </Button>
      </form>
    </details>
  );
}
