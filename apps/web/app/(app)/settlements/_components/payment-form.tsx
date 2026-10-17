'use client';
import type { SettlementBill, SettlementPayment } from '@/lib/settlement-queries';
import { Button } from '@mybizone/ui/button';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useEffect, useState } from 'react';
import {
  allocateExistingSettlementAction,
  createPurchaseSettlementAction,
  createSalesSettlementAction,
} from '../actions';
type Party = { id: string; name: string; outstandingBalance: string };
type Side = 'sales' | 'purchases';
const money = (n: string) => `₹${Number(n).toFixed(2)}`;
function showSaved(kind: 'recorded' | 'allocated', id: string, side: Side, partyId?: string) {
  const url = new URL('/settlements', window.location.origin);
  if (side === 'purchases') url.searchParams.set('tab', 'purchases');
  if (partyId) url.searchParams.set(side === 'sales' ? 'customerId' : 'supplierId', partyId);
  url.searchParams.set(kind, id);
  window.location.assign(url.href);
}
export function PaymentForm({
  side,
  parties,
  bills,
  initialPartyId,
}: { side: Side; parties: Party[]; bills: SettlementBill[]; initialPartyId?: string }) {
  const [party, setParty] = useState(parties.find((p) => p.id === initialPartyId)?.id ?? '');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [bill, setBill] = useState('');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [id, setId] = useState('');
  const options = bills.filter((b) => b.partyId === party && Number(b.remaining) > 0);
  return (
    <form
      className="space-y-4 rounded-lg border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage('');
        const fd = new FormData(e.currentTarget);
        const key = id || crypto.randomUUID();
        setId(key);
        const payload = {
          id: key,
          billId: bill || undefined,
          amount,
          paymentMethod: String(fd.get('method')),
          referenceNo: String(fd.get('reference') || '') || undefined,
          notes: String(fd.get('notes') || '') || undefined,
        };
        try {
          const result =
            side === 'sales'
              ? await createSalesSettlementAction({ ...payload, customerId: party })
              : await createPurchaseSettlementAction({ ...payload, supplierId: party });
          if (!result.ok) {
            setPending(false);
            setMessage(result.error);
            return;
          }
          showSaved('recorded', result.data.id, side, party);
        } catch {
          setPending(false);
          setMessage(
            'Could not confirm the save. Retry this form to check the same request safely.',
          );
        }
      }}
    >
      <h2 className="text-lg font-semibold">
        Record {side === 'sales' ? 'sales' : 'purchase'} settlement
      </h2>
      <div className="space-y-2">
        <Label htmlFor="party">{side === 'sales' ? 'Customer' : 'Supplier'}</Label>
        <Select
          id="party"
          required
          value={party}
          onChange={(e) => {
            setParty(e.target.value);
            setBill('');
            setAmount('');
          }}
        >
          <option value="">Select a {side === 'sales' ? 'customer' : 'supplier'}…</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {money(p.outstandingBalance)} due
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bill">Apply to bill</Label>
        <Select
          id="bill"
          value={bill}
          onChange={(e) => {
            setBill(e.target.value);
            const selected = options.find((b) => b.id === e.target.value);
            setAmount(selected ? selected.remaining : '');
          }}
        >
          <option value="">Leave unallocated / earlier balance</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.billNo} — {money(b.remaining)} before unallocated payments
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Bill choices exclude orders, EMI and estimates. Earlier payments may still need
          allocation. Amount cannot exceed the party balance.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount ₹</Label>
        <Input
          id="amount"
          required
          inputMode="decimal"
          pattern="^\d{1,10}(?:\.\d{1,2})?$"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="method">Payment method</Label>
        <Select id="method" name="method" defaultValue="cash">
          {['cash', 'upi', 'card', 'cheque', 'other'].map((m) => (
            <option key={m} value={m}>
              {m === 'upi' ? 'UPI' : m[0]?.toUpperCase() + m.slice(1)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reference">Reference no. (optional)</Label>
        <Input id="reference" name="reference" maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" name="notes" maxLength={500} />
      </div>
      {message && <output className="block text-sm">{message}</output>}
      <Button disabled={!ready || pending} className="w-full" type="submit">
        {pending ? 'Recording…' : 'Record settlement'}
      </Button>
    </form>
  );
}
export function AllocationForm({
  side,
  bills,
  payments,
}: { side: Side; bills: SettlementBill[]; payments: SettlementPayment[] }) {
  const [payment, setPayment] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [id, setId] = useState('');
  const selected = payments.find((p) => p.id === payment);
  const options = bills.filter((b) => b.partyId === selected?.partyId && Number(b.remaining) > 0);
  return (
    <form
      className="space-y-4 rounded-lg border p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setMessage('');
        const key = id || crypto.randomUUID();
        setId(key);
        try {
          const result = await allocateExistingSettlementAction({
            id: key,
            side,
            settlementId: payment,
            billId: fd.get('allocationBill'),
            amount: fd.get('allocationAmount'),
            note: fd.get('allocationNote'),
          });
          if (!result.ok) {
            setPending(false);
            setMessage(result.error);
            return;
          }
          showSaved('allocated', result.data.id, side, selected?.partyId);
        } catch {
          setPending(false);
          setMessage(
            'Could not confirm the save. Retry this form to check the same request safely.',
          );
        }
      }}
    >
      <h2 className="text-lg font-semibold">Assign an earlier payment</h2>
      <p className="text-sm text-muted-foreground">
        Use the payment reference to select its bill. This changes bill allocation only; the party
        balance and cashbook stay the same.
      </p>
      <div className="space-y-2">
        <Label htmlFor="payment">Unallocated payment</Label>
        <Select id="payment" required value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">Select a recorded payment…</option>
          {payments
            .filter((p) => Number(p.unallocated) > 0)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ·{' '}
                {p.reference ||
                  new Date(p.settledAt).toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                  })}{' '}
                · {money(p.unallocated)}
              </option>
            ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="allocationBill">Bill receiving allocation</Label>
        <Select id="allocationBill" name="allocationBill" key={payment} required defaultValue="">
          <option value="">Select a credit bill…</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.billNo} · {money(b.remaining)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="allocationAmount">Allocation amount ₹</Label>
        <Input
          id="allocationAmount"
          name="allocationAmount"
          inputMode="decimal"
          required
          pattern="^\d{1,10}(?:\.\d{1,2})?$"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="allocationNote">Allocation evidence / note</Label>
        <Input
          id="allocationNote"
          name="allocationNote"
          minLength={3}
          maxLength={500}
          required
          placeholder="Bill reference confirmed with customer / supplier"
        />
      </div>
      {message && <output className="block text-sm">{message}</output>}
      <Button type="submit" variant="outline" disabled={!ready || pending || !selected}>
        Assign payment to bill
      </Button>
    </form>
  );
}
