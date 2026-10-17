'use client';
import { type FundsCommand, fundsCommands, fundsLabels } from '@/lib/funds-policy';
import type { fundsRegister } from '@/lib/funds-queries';
import type { SettlementSide } from '@/lib/settlement-ledger';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useEffect, useRef, useState } from 'react';
import { accountingCommandAction } from '../actions';
type Data = Awaited<ReturnType<typeof fundsRegister>>;
const money = (v: string) => `₹${Number(v).toFixed(2)}`;
export function FundsForm({ side, data }: { side: SettlementSide; data: Data }) {
  const [kind, setKind] = useState<FundsCommand>('advance');
  const [source, setSource] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const id = useRef('');
  useEffect(() => setReady(true), []);
  const event = data.events.find((e) => e.id === source);
  const correction = ['settlement_reverse', 'allocation_reverse', 'money_reverse'].includes(kind);
  const moneyCommand = ['advance', 'advance_refund', 'return_refund'].includes(kind);
  const sources =
    kind === 'advance_apply' || kind === 'advance_refund'
      ? data.events
          .filter((e) => e.kind === 'advance' && Number(e.available) > 0)
          .map((e) => ({
            id: e.id,
            label: `${e.name} · ${e.reference || e.note} · ${money(e.available)} unused`,
          }))
      : kind === 'return_refund'
        ? data.refunds
            .filter((r) => Number(r.remaining) > 0)
            .map((r) => ({
              id: r.id,
              label: `${r.returnNo} · ${r.name} · ${money(r.remaining)} due`,
            }))
        : kind === 'settlement_reverse'
          ? data.payments.map((p) => ({
              id: p.id,
              label: `${p.name} · ${p.reference || new Date(p.settledAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · ${money(p.amount)}`,
            }))
          : kind === 'allocation_reverse'
            ? data.allocations.map((a) => ({
                id: a.id,
                label: `${a.billNo} · ${a.name} · ${money(a.amount)}`,
              }))
            : data.events
                .filter(
                  (e) =>
                    ['advance', 'advance_refund', 'return_refund'].includes(e.kind) && !e.reversed,
                )
                .map((e) => ({
                  id: e.id,
                  label: `${fundsLabels[e.kind]} · ${e.name} · ${e.reference || e.note} · ${money(e.amount)}`,
                }));
  const options = data.bills.filter((b) => b.partyId === event?.partyId && Number(b.remaining) > 0);
  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        const key = id.current || crypto.randomUUID();
        id.current = key;
        setPending(true);
        setError('');
        try {
          const result = await accountingCommandAction({
            id: key,
            side,
            kind,
            partyId: kind === 'advance' ? fd.get('party') : undefined,
            sourceId: kind !== 'advance' ? source : undefined,
            billId: kind === 'advance_apply' ? fd.get('bill') : undefined,
            amount: !correction ? fd.get('amount') : undefined,
            method: moneyCommand ? fd.get('method') : undefined,
            reference: moneyCommand ? String(fd.get('reference') ?? '') : undefined,
            note: fd.get('note'),
          });
          if (!result.ok) {
            setError(result.error);
            setPending(false);
            return;
          }
          window.location.assign(`/settlements/funds?tab=${side}&saved=${result.data.id}`);
        } catch {
          setError('Could not confirm the save. Retry this form to check the same request safely.');
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        <h2 className="text-lg font-semibold">Record funds or a correction</h2>
        <div className="space-y-2">
          <Label htmlFor="funds-command">Action</Label>
          <Select
            id="funds-command"
            value={kind}
            disabled={pending}
            onChange={(e) => {
              setKind(e.target.value as FundsCommand);
              setSource('');
              setError('');
            }}
          >
            {fundsCommands.map((k) => (
              <option key={k} value={k}>
                {fundsLabels[k]}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === 'advance'
            ? side === 'sales'
              ? 'Record money received before a bill is settled. Customer debt stays unchanged.'
              : 'Record a prepayment to a supplier. Supplier debt stays unchanged.'
            : kind === 'advance_apply'
              ? 'Apply prepaid money to a credit bill. This reduces debt without recording another cash movement.'
              : kind === 'advance_refund'
                ? 'Record money returned from the unused advance. Debt stays unchanged.'
                : kind === 'return_refund'
                  ? side === 'sales'
                    ? 'Record money refunded to a customer for returned goods. Stock and debt have already been adjusted.'
                    : 'Record money received back from a supplier for returned goods. Stock and debt have already been adjusted.'
                  : kind === 'allocation_reverse'
                    ? 'Undo a mistaken bill assignment in full. The payment remains recorded and can be assigned again.'
                    : 'Correct a mistaken money record in full. Original evidence stays visible. For an actual return refund, choose Record return refund.'}
        </p>
        {kind === 'advance' ? (
          <div className="space-y-2">
            <Label htmlFor="funds-party">{side === 'sales' ? 'Customer' : 'Supplier'}</Label>
            <Select id="funds-party" name="party" required defaultValue="">
              <option value="">Select a party…</option>
              {data.parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.outstandingBalance)} debt
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="funds-source">Source record</Label>
            <Select
              id="funds-source"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Select a source…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            {!sources.length && (
              <p className="text-xs text-muted-foreground">
                No eligible source records. Record an advance or a reconciled return first.
              </p>
            )}
          </div>
        )}
        {kind === 'advance_apply' && (
          <div className="space-y-2">
            <Label htmlFor="funds-bill">Credit bill</Label>
            <Select id="funds-bill" name="bill" key={source} required defaultValue="">
              <option value="">Select a credit bill…</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.billNo} · {money(b.remaining)} remaining
                </option>
              ))}
            </Select>
          </div>
        )}
        {!correction && (
          <div className="space-y-2">
            <Label htmlFor="funds-amount">Amount ₹</Label>
            <Input
              key={kind}
              id="funds-amount"
              name="amount"
              required
              inputMode="decimal"
              pattern="^\d{1,10}(?:\.\d{1,2})?$"
            />
          </div>
        )}
        {moneyCommand && (
          <>
            <div className="space-y-2">
              <Label htmlFor="funds-method">Payment method</Label>
              <Select id="funds-method" name="method" defaultValue="cash">
                {['cash', 'upi', 'card', 'bank', 'cheque', 'other'].map((m) => (
                  <option key={m} value={m}>
                    {m === 'upi' ? 'UPI' : m[0]?.toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funds-reference">Reference (optional)</Label>
              <Input id="funds-reference" name="reference" maxLength={100} />
            </div>
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="funds-note">Evidence / reason</Label>
          <Input id="funds-note" name="note" required minLength={3} maxLength={500} />
        </div>
        {correction && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1" />I checked the original record and
            confirm this full correction.
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!ready || pending}>
          {pending ? 'Saving…' : fundsLabels[kind]}
        </Button>
      </fieldset>
    </form>
  );
}
