'use client';
import { SerialNumbersField } from '@/components/serial-numbers-field';
import { parseSerialText } from '@/lib/serial-policy';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { Textarea } from '@mybizone/ui/textarea';
import { type ReactNode, useEffect, useState } from 'react';
import {
  cancelOrderAction,
  deliverOrderAction,
  recordOrderPaymentAction,
  rescheduleOrderAction,
} from '../actions';
type Result = { ok: true; data: unknown } | { ok: false; error: string };
function ActionForm({
  action,
  children,
  label,
  disabled = false,
}: {
  action: (fd: FormData) => Promise<Result>;
  children: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState('');
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
          const result = await action(fd);
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          window.location.reload();
        } catch {
          setPending(false);
          setError(
            'Could not confirm the save. Retry this form; the same request ID prevents duplicate receipts or handovers.',
          );
        }
      }}
    >
      <fieldset disabled={!ready || pending} className="min-w-0 space-y-4">
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={!ready || pending || disabled}>{pending ? 'Saving…' : label}</Button>
      </fieldset>
    </form>
  );
}
export function OrderPaymentForm({
  orderId,
  kind,
  max,
}: { orderId: string; kind: 'receipt' | 'refund'; max: number }) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      label={kind === 'receipt' ? 'Record payment received' : 'Record refund already paid'}
      disabled={max <= 0}
      action={(fd) =>
        recordOrderPaymentAction({
          id,
          orderId,
          kind,
          amount: fd.get('amount'),
          method: fd.get('method'),
          reference: fd.get('reference'),
          note: fd.get('note'),
        })
      }
    >
      <p className="text-sm text-muted-foreground">
        {kind === 'receipt'
          ? 'Record money actually received outside this application. It pays this order’s delivery bills first; the unused amount remains an advance.'
          : 'Record money actually returned outside this application. Only unused advances can be refunded; delivered unpaid value remains customer debt.'}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label className="block space-y-2">
          Amount (₹)
          <Input
            required
            name="amount"
            type="number"
            min="0.01"
            max={(max / 100).toFixed(2)}
            step="0.01"
          />
        </Label>
        <div className="space-y-2">
          <Label htmlFor={`order-payment-method-${kind}`}>Payment method</Label>
          <Select id={`order-payment-method-${kind}`} name="method" defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <Label className="block space-y-2 sm:col-span-2">
          Reference (optional)
          <Input name="reference" maxLength={100} />
        </Label>
        <Label className="block space-y-2 sm:col-span-2">
          Payment note
          <Textarea name="note" required minLength={3} maxLength={500} />
        </Label>
      </div>
    </ActionForm>
  );
}
export interface HandoverItem {
  id: string;
  name: string;
  qty: string;
  delivered: string;
  unit: string;
  unitType: string;
  serialTracking: boolean;
  inventory: string;
  availableSerials: string[];
}
export function OrderDeliveryForm({ orderId, items }: { orderId: string; items: HandoverItem[] }) {
  const [id] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string>>({});
  return (
    <ActionForm
      label="Create delivery bill"
      action={(fd) =>
        deliverOrderAction({
          id,
          orderId,
          note: fd.get('note'),
          items: items
            .filter((i) => Number(fd.get(`qty-${i.id}`) ?? 0) > 0)
            .map((i) => ({
              itemId: i.id,
              qty: String(fd.get(`qty-${i.id}`)),
              serialNumbers: i.serialTracking
                ? parseSerialText(String(fd.get(`serials-${i.id}`) ?? ''))
                : undefined,
            })),
        })
      }
    >
      <p className="text-sm text-muted-foreground">
        Record goods physically handed over, including a partial delivery. This creates a sales bill
        and removes stock once. Available stock is checked when saved; orders do not reserve it.
      </p>
      {items
        .filter((i) => Number(i.delivered) < Number(i.qty))
        .map((item) => (
          <fieldset key={item.id} className="min-w-0 space-y-3 rounded-lg border p-3">
            <legend className="max-w-full break-words px-1 text-sm font-medium">{item.name}</legend>
            <p className="text-xs text-muted-foreground">
              {Number(item.qty) - Number(item.delivered)} {item.unit} remaining · {item.inventory}{' '}
              {item.unit} sellable now
            </p>
            <Label className="block space-y-2">
              Handover quantity ({item.unit})
              <Input
                name={`qty-${item.id}`}
                type="number"
                min={0}
                max={Number(item.qty) - Number(item.delivered)}
                step={item.unitType === 'piece' ? 1 : 0.001}
                value={quantities[item.id] ?? ''}
                onChange={(e) => setQuantities((old) => ({ ...old, [item.id]: e.target.value }))}
                placeholder="0"
              />
            </Label>
            {item.serialTracking && Number(quantities[item.id] ?? 0) > 0 && (
              <SerialNumbersField
                id={`handover-${item.id}`}
                name={`serials-${item.id}`}
                value={serials[item.id] ?? ''}
                onChange={(v) => setSerials((old) => ({ ...old, [item.id]: v }))}
                available={item.availableSerials}
              />
            )}
          </fieldset>
        ))}
      <Label className="block space-y-2">
        Recipient / handover reference
        <Textarea required name="note" minLength={3} maxLength={500} />
      </Label>
    </ActionForm>
  );
}
export function CancelOrderForm({ orderId, held }: { orderId: string; held: number }) {
  return (
    <ActionForm
      label="Cancel undelivered remainder"
      disabled={held > 0}
      action={(fd) => cancelOrderAction({ orderId, note: fd.get('note') })}
    >
      <p className="text-sm text-muted-foreground">
        Delivered bills and any unpaid delivery debt stay recorded. Refund unused advances before
        cancelling the remainder.
      </p>
      <Label className="block space-y-2">
        Cancellation note
        <Textarea required name="note" minLength={3} maxLength={500} />
      </Label>
    </ActionForm>
  );
}
export function RescheduleOrderForm({
  orderId,
  promisedOn,
  address,
}: { orderId: string; promisedOn: string; address: string }) {
  return (
    <ActionForm
      label="Save handover arrangements"
      action={(fd) =>
        rescheduleOrderAction({
          orderId,
          promisedOn: fd.get('promisedOn'),
          deliveryAddress: fd.get('deliveryAddress'),
          note: fd.get('note'),
        })
      }
    >
      <Label className="block space-y-2">
        Promised handover date
        <Input name="promisedOn" type="date" required defaultValue={promisedOn} />
      </Label>
      <Label className="block space-y-2">
        Delivery address
        <Textarea name="deliveryAddress" required maxLength={1000} defaultValue={address} />
      </Label>
      <Label className="block space-y-2">
        Change note
        <Textarea required name="note" minLength={3} maxLength={500} />
      </Label>
    </ActionForm>
  );
}
