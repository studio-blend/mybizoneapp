'use client';
import type { MoneyInput } from '@/lib/money-policy';
import type { moneyRegister } from '@/lib/money-queries';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useEffect, useRef, useState } from 'react';
import { moneyCommandAction } from '../actions';
type Data = Awaited<ReturnType<typeof moneyRegister>>;
const labels: Record<MoneyInput['kind'], string> = {
  account: 'Add account',
  opening: 'Correct opening',
  source: 'Assign recorded money',
  transfer: 'Transfer between accounts',
  clear: 'Mark cleared',
  bounce: 'Mark bounced',
  cancel: 'Cancel pending',
  reverse: 'Reverse cleared',
  offset: 'Reconcile bounced correction',
};
export function MoneyForm({ data, today }: { data: Data; today: string }) {
  const [kind, setKind] = useState<MoneyInput['kind']>('account');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<string>();
  useEffect(() => setReady(true), []);
  const entries = data.postings.filter((p) =>
    kind === 'clear' || kind === 'cancel'
      ? p.state === 'pending'
      : kind === 'reverse'
        ? p.state === 'cleared'
        : ['cleared', 'pending'].includes(p.state),
  );
  const sources =
    kind === 'offset'
      ? data.sources.filter((s) =>
          data.postings.some(
            (p) => p.source_id === s.id && p.source_kind === s.source_kind && p.state === 'bounce',
          ),
        )
      : data.unassigned;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setPending(true);
    const f = new FormData(e.currentTarget);
    request.current ??= crypto.randomUUID();
    const input: Record<string, unknown> = {
      id: request.current,
      kind,
      day: f.get('day'),
      reference: f.get('reference'),
      note: f.get('note'),
    };
    for (const key of [
      'name',
      'accountKind',
      'accountId',
      'toAccountId',
      'postingId',
      'amount',
      'correctionId',
    ])
      if (f.has(key)) input[key] = f.get(key);
    if (f.has('source')) {
      const [sourceKind, sourceId] = String(f.get('source')).split(':');
      input.sourceKind = sourceKind;
      input.sourceId = sourceId;
    }
    try {
      const result = await moneyCommandAction(input);
      if (result.ok) window.location.assign(`/money?saved=${result.data.id}`);
      else {
        setError(result.error);
        setPending(false);
      }
    } catch {
      setError('Response uncertain. Retry unchanged details to safely reuse this request.');
      setPending(false);
    }
  }
  const field = (id: string, label: string, node: React.ReactNode) => (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {node}
    </div>
  );
  const account = (name: string, label: string) =>
    field(
      name,
      label,
      <Select id={name} name={name} required defaultValue="">
        <option value="" disabled>
          Choose an account
        </option>
        {data.accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.kind}
          </option>
        ))}
      </Select>,
    );
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border p-4"
      aria-label="Cash and bank command"
    >
      <h2 className="text-lg font-semibold">Record account evidence</h2>
      <p className="text-sm text-muted-foreground">
        Assignments start pending. Clear them only after checking physical cash or the bank
        statement. Each command retains its reference and note.
      </p>
      <fieldset disabled={pending || !ready} className="grid min-w-0 gap-4 sm:grid-cols-2">
        {field(
          'kind',
          'Action',
          <Select
            id="kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as MoneyInput['kind']);
              request.current = undefined;
              setError('');
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>,
        )}
        {kind === 'account' && (
          <>
            {field(
              'name',
              'Account name',
              <Input
                id="name"
                name="name"
                minLength={2}
                maxLength={80}
                required
                placeholder="Main till or current account"
              />,
            )}
            {field(
              'accountKind',
              'Account type',
              <Select id="accountKind" name="accountKind">
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </Select>,
            )}
          </>
        )}
        {['source', 'transfer', 'opening'].includes(kind) &&
          account('accountId', kind === 'transfer' ? 'From account' : 'Account')}
        {kind === 'transfer' && account('toAccountId', 'To account')}
        {['source', 'offset'].includes(kind) &&
          field(
            'source',
            kind === 'source' ? 'Unassigned recorded money' : 'Bounced original money',
            <Select id="source" name="source" required defaultValue="">
              <option value="" disabled>
                Choose a source
              </option>
              {sources.map((s) => (
                <option key={`${s.source_kind}:${s.id}`} value={`${s.source_kind}:${s.id}`}>
                  {s.day} · {s.label} · {s.method}
                  {'remaining' in s ? ` · ₹${s.remaining}` : ''}
                </option>
              ))}
            </Select>,
          )}
        {kind === 'offset' &&
          field(
            'correctionId',
            'Linked correction',
            <Select id="correctionId" name="correctionId" required defaultValue="">
              <option value="" disabled>
                Choose its recorded reversal
              </option>
              {data.unassigned
                .filter((s) => s.source_kind === 'accounting_event')
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.day} · {s.label} · ₹{s.remaining}
                  </option>
                ))}
            </Select>,
          )}
        {['clear', 'bounce', 'cancel', 'reverse'].includes(kind) &&
          field(
            'postingId',
            'Account entry',
            <Select id="postingId" name="postingId" required defaultValue="">
              <option value="" disabled>
                Choose an entry
              </option>
              {entries.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · {p.label ?? 'Transfer'} · ₹{p.amount} · {p.state}
                </option>
              ))}
            </Select>,
          )}
        {['account', 'opening', 'source', 'transfer', 'offset'].includes(kind) &&
          field(
            'amount',
            kind === 'account' || kind === 'opening' ? 'Verified opening balance' : 'Amount',
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              max="9999999999.99"
              min={kind === 'account' || kind === 'opening' ? undefined : '0.01'}
              required
            />,
          )}
        {field(
          'day',
          kind === 'account' || kind === 'opening'
            ? 'Opening date (start of day)'
            : 'Evidence date',
          <Input id="day" name="day" type="date" max={today} defaultValue={today} required />,
        )}
        {field(
          'reference',
          'Evidence reference',
          <Input
            id="reference"
            name="reference"
            minLength={3}
            maxLength={100}
            required
            placeholder="Statement line, cheque or count sheet"
          />,
        )}
        {field(
          'note',
          'Evidence note',
          <Input
            id="note"
            name="note"
            minLength={3}
            maxLength={500}
            required
            placeholder="What was checked and why"
          />,
        )}
        <div className="sm:col-span-2">
          <Button type="submit">{pending ? 'Saving…' : labels[kind]}</Button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              request.current = undefined;
              setError('');
            }}
          >
            Start a new request after correcting details
          </button>
        </p>
      )}
      {kind === 'opening' && (
        <p className="text-sm text-muted-foreground">
          Keep the original opening date. Cancel or reverse active entries first. The original
          opening stays in the audit history.
        </p>
      )}
      {kind === 'offset' && (
        <p className="text-sm text-muted-foreground">
          First correct the original receipt/payment in Advances &amp; refunds. Only its linked
          opposite reversal can be reconciled here. This records no new cash movement.
        </p>
      )}
    </form>
  );
}
