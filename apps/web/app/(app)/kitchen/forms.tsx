'use client';
import { recipeQuantity } from '@/lib/kitchen-policy';
import type { KitchenData } from '@/lib/kitchen-queries';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { useEffect, useState } from 'react';
import {
  archiveRecipeAction,
  changeKitchenTicketAction,
  completeKitchenTicketAction,
  createKitchenTicketAction,
  createRecipeAction,
  recordKitchenWasteAction,
} from './actions';
type Result = { ok: true; data: { id: string } } | { ok: false; error: string };
function useCommand() {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setReady(true), []);
  async function run(
    action: () => Promise<Result>,
    done: (id: string) => void = () => window.location.reload(),
  ) {
    setPending(true);
    setError('');
    try {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        setPending(false);
        return;
      }
      done(r.data.id);
    } catch {
      setError('Could not confirm the save. Retry this form to check the same request safely.');
      setPending(false);
    }
  }
  return { disabled: !ready || pending, pending, error, run };
}
function ErrorText({ value }: { value: string }) {
  return value ? (
    <p role="alert" className="text-sm text-destructive">
      {value}
    </p>
  ) : null;
}
export function PrintTicket() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Print prep ticket
    </Button>
  );
}
function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
export function RecipeForm({ data }: { data: KitchenData }) {
  const c = useCommand();
  const [id] = useState(() => crypto.randomUUID());
  const [outputId, setOutput] = useState('');
  const [lines, setLines] = useState([{ key: 'first', productId: '', qty: '1' }]);
  const output = data.products.find((p) => p.id === outputId);
  const options = data.products.filter(
    (p) => p.active && !p.serialTracking && data.configureStores.includes(p.storeId),
  );
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void c.run(() =>
          createRecipeAction({
            id,
            outputProductId: outputId,
            name: fd.get('name'),
            yieldQty: fd.get('yieldQty'),
            items: lines.map(({ productId, qty }) => ({ productId, qty })),
          }),
        );
      }}
    >
      <fieldset disabled={c.disabled} className="min-w-0 space-y-4">
        <Field label="Recipe name / version" id="recipe-name">
          <Input
            id="recipe-name"
            name="name"
            required
            maxLength={100}
            placeholder="Morning rolls · version 1"
          />
        </Field>
        <Field label="Prepared product" id="recipe-output">
          <Select
            id="recipe-output"
            value={outputId}
            required
            onChange={(e) => {
              setOutput(e.target.value);
              setLines([{ key: 'first', productId: '', qty: '1' }]);
            }}
          >
            <option value="">Choose prepared stock</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {data.stores.find((s) => s.id === p.storeId)?.name} · {p.unitSymbol}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={`Expected yield per batch${output ? ` (${output.unitSymbol})` : ''}`}
          id="recipe-yield"
        >
          <Input
            id="recipe-yield"
            name="yieldQty"
            required
            type="number"
            min={output?.unitType === 'piece' ? 1 : 0.001}
            step={output?.unitType === 'piece' ? 1 : 0.001}
            defaultValue="1"
          />
        </Field>
        <div className="space-y-4">
          <h3 className="font-semibold">Ingredients per recipe batch</h3>
          {lines.map((line, index) => {
            const ingredient = data.products.find((p) => p.id === line.productId);
            return (
              <div key={line.key} className="space-y-3 border-t pt-4">
                <Field label={`Ingredient ${index + 1}`} id={`ingredient-${line.key}`}>
                  <Select
                    id={`ingredient-${line.key}`}
                    required
                    value={line.productId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l) =>
                          l.key === line.key ? { ...l, productId: e.target.value, qty: '1' } : l,
                        ),
                      )
                    }
                  >
                    <option value="">Choose ingredient from the same store</option>
                    {options
                      .filter((p) => p.storeId === output?.storeId && p.id !== outputId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.unitSymbol}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field
                  label={`Ingredient quantity ${index + 1}${ingredient ? ` (${ingredient.unitSymbol})` : ''}`}
                  id={`ingredient-qty-${line.key}`}
                >
                  <Input
                    id={`ingredient-qty-${line.key}`}
                    type="number"
                    required
                    min={ingredient?.unitType === 'piece' ? 1 : 0.001}
                    step={ingredient?.unitType === 'piece' ? 1 : 0.001}
                    value={line.qty}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l) => (l.key === line.key ? { ...l, qty: e.target.value } : l)),
                      )
                    }
                  />
                </Field>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  >
                    Remove ingredient {index + 1}
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= 50}
            onClick={() =>
              setLines((ls) => [...ls, { key: crypto.randomUUID(), productId: '', qty: '1' }])
            }
          >
            Add ingredient
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use each product's stock unit: enter 0.150 for 150g when stock is in kg. Recipes keep
          their original quantities. Archive and replace a version to change it. No stock moves when
          saving a recipe.
        </p>
        <ErrorText value={c.error} />
        <Button type="submit">{c.pending ? 'Saving recipe…' : 'Save recipe version'}</Button>
      </fieldset>
    </form>
  );
}
export function ArchiveRecipe({ id }: { id: string }) {
  const c = useCommand();
  return (
    <div>
      <Button
        variant="outline"
        disabled={c.disabled}
        onClick={() => void c.run(() => archiveRecipeAction({ id }))}
      >
        Archive recipe
      </Button>
      <ErrorText value={c.error} />
    </div>
  );
}
export function TicketForm({ data }: { data: KitchenData }) {
  const c = useCommand();
  const [id] = useState(() => crypto.randomUUID());
  const [recipeId, setRecipe] = useState('');
  const [runs, setRuns] = useState('1');
  const recipe = data.recipes.find((r) => r.id === recipeId);
  let target = '';
  try {
    if (recipe)
      target = `${recipeQuantity(recipe.yieldQty, Number(runs), recipe.unitType)} ${recipe.unitSymbol}`;
  } catch {}
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void c.run(
          () =>
            createKitchenTicketAction({
              id,
              recipeId,
              runs,
              reference: fd.get('reference'),
              note: fd.get('note'),
            }),
          (id) => {
            window.location.href = `/kitchen/${id}`;
          },
        );
      }}
    >
      <fieldset disabled={c.disabled} className="min-w-0 space-y-4">
        <Field label="Recipe version" id="ticket-recipe">
          <Select
            id="ticket-recipe"
            required
            value={recipeId}
            onChange={(e) => setRecipe(e.target.value)}
          >
            <option value="">Choose active recipe</option>
            {data.recipes
              .filter((r) => r.active)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {data.stores.find((s) => s.id === r.storeId)?.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Whole recipe batches" id="ticket-runs">
            <Input
              id="ticket-runs"
              type="number"
              required
              min={1}
              max={10000}
              step={1}
              value={runs}
              onChange={(e) => setRuns(e.target.value)}
            />
          </Field>
          <Field label="Kitchen reference" id="ticket-reference">
            <Input
              id="ticket-reference"
              name="reference"
              required
              maxLength={100}
              placeholder="Morning counter · 8am"
            />
          </Field>
        </div>
        {target && (
          <p className="text-sm">
            Target: <strong>{target}</strong> of {recipe?.outputName}
          </p>
        )}
        <Field label="Preparation notes" id="ticket-note">
          <Textarea id="ticket-note" name="note" maxLength={500} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Planning and starting a ticket do not reserve or consume stock. Record actual preparation
          once the ingredients are used and finished goods are ready.
        </p>
        <ErrorText value={c.error} />
        <Button type="submit">{c.pending ? 'Saving ticket…' : 'Create prep ticket'}</Button>
      </fieldset>
    </form>
  );
}
export function TicketStatus({ id, status }: { id: string; status: string }) {
  const c = useCommand();
  if (status === 'completed' || status === 'cancelled') return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {status === 'queued' && (
          <Button
            disabled={c.disabled}
            onClick={() => void c.run(() => changeKitchenTicketAction({ id, status: 'preparing' }))}
          >
            Start preparation
          </Button>
        )}
        <Button
          variant="outline"
          disabled={c.disabled}
          onClick={() => void c.run(() => changeKitchenTicketAction({ id, status: 'cancelled' }))}
        >
          Cancel unrecorded preparation
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cancellation moves no stock. Record ingredients already lost through Kitchen waste.
        Completed preparation cannot be cancelled or undone.
      </p>
      <ErrorText value={c.error} />
    </div>
  );
}
export function CompleteTicketForm({
  id,
  target,
  unit,
  unitType,
  batchTracking,
}: { id: string; target: string; unit: string; unitType: string; batchTracking: boolean }) {
  const c = useCommand();
  return (
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void c.run(() =>
          completeKitchenTicketAction({
            id,
            actualOutput: fd.get('actualOutput'),
            batchCode: fd.get('batchCode') ?? '',
            expiresOn: fd.get('expiresOn') ?? '',
            note: fd.get('note'),
          }),
        );
      }}
    >
      <fieldset disabled={c.disabled} className="min-w-0 space-y-4">
        <Field label={`Actual finished quantity (${unit})`} id="actual-output">
          <Input
            id="actual-output"
            name="actualOutput"
            required
            type="number"
            min={unitType === 'piece' ? 1 : 0.001}
            step={unitType === 'piece' ? 1 : 0.001}
            max={target}
            defaultValue={target}
          />
        </Field>
        {batchTracking && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prepared batch code" id="output-batch">
              <Input id="output-batch" name="batchCode" required maxLength={80} />
            </Field>
            <Field label="Prepared batch expiry" id="output-expiry">
              <Input id="output-expiry" name="expiresOn" type="date" required />
            </Field>
          </div>
        )}
        <Field label="Yield / handover notes" id="completion-note">
          <Textarea id="completion-note" name="note" maxLength={500} />
        </Field>
        <p className="text-sm text-muted-foreground">
          This consumes the full recipe ingredients and adds the actual finished quantity once. A
          lower yield concentrates the ingredient cost into fewer finished units. For a failed batch
          with no usable output, record the lost ingredients as waste and cancel the ticket.
        </p>
        <ErrorText value={c.error} />
        <Button type="submit">
          {c.pending ? 'Recording preparation…' : 'Record actual preparation'}
        </Button>
      </fieldset>
    </form>
  );
}
export function WasteForm({ data }: { data: KitchenData }) {
  const c = useCommand();
  const [id] = useState(() => crypto.randomUUID());
  const [productId, setProduct] = useState('');
  const p = data.products.find((p) => p.id === productId);
  return (
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void c.run(() =>
          recordKitchenWasteAction({
            id,
            productId,
            qty: fd.get('qty'),
            batchId: fd.get('batchId') ?? '',
            reason: fd.get('reason'),
            note: fd.get('note'),
          }),
        );
      }}
    >
      <fieldset disabled={c.disabled} className="min-w-0 space-y-4">
        <Field label="Wasted product / ingredient" id="waste-product">
          <Select
            id="waste-product"
            required
            value={productId}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">Choose physical stock</option>
            {data.products
              .filter((p) => p.active && !p.serialTracking)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {data.stores.find((s) => s.id === p.storeId)?.name} · {p.unitSymbol}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={`Waste quantity${p ? ` (${p.unitSymbol})` : ''}`} id="waste-qty">
          <Input
            id="waste-qty"
            name="qty"
            required
            type="number"
            min={p?.unitType === 'piece' ? 1 : 0.001}
            step={p?.unitType === 'piece' ? 1 : 0.001}
          />
        </Field>
        {p?.batchTracking && (
          <Field label="Physical batch to discard" id="waste-batch">
            <Select id="waste-batch" name="batchId" required key={p.id}>
              <option value="">Choose batch</option>
              {data.batches
                .filter((b) => b.productId === p.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.quantity} {p.unitSymbol} · {b.expiresOn ?? 'no expiry'} ·{' '}
                    {b.state}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Waste reason" id="waste-reason">
          <Select id="waste-reason" name="reason" required>
            <option value="preparation">Preparation loss</option>
            <option value="unsold">Unsold prepared food</option>
            <option value="spillage">Spillage</option>
            <option value="expired">Expired</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Waste explanation / kitchen reference" id="waste-note">
          <Textarea id="waste-note" name="note" required maxLength={500} />
        </Field>
        <p className="text-xs text-muted-foreground">
          Remove only physical stock still on hand. Ingredients already consumed by a completed
          ticket must not be written off again. The same record appears in Damage Logs and existing
          loss reports.
        </p>
        <ErrorText value={c.error} />
        <Button type="submit">{c.pending ? 'Recording waste…' : 'Write off kitchen waste'}</Button>
      </fieldset>
    </form>
  );
}
