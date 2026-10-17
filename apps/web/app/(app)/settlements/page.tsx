import { db } from '@/lib/db';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { settlementRegister } from '@/lib/settlement-queries';
import { customers, suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { eq } from 'drizzle-orm';
import { AllocationForm, PaymentForm } from './_components/payment-form';
export const dynamic = 'force-dynamic';
export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    customerId?: string;
    supplierId?: string;
    recorded?: string;
    allocated?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  await requirePermission(user, 'manage_expenses');
  const side = params.tab === 'purchases' ? 'purchases' : 'sales';
  const data = await withTenant(db, user.businessId, async (tx) => {
    const parties =
      side === 'sales'
        ? await tx
            .select({
              id: customers.id,
              name: customers.name,
              outstandingBalance: customers.outstandingBalance,
            })
            .from(customers)
            .where(eq(customers.businessId, user.businessId))
        : await tx
            .select({
              id: suppliers.id,
              name: suppliers.name,
              outstandingBalance: suppliers.outstandingBalance,
            })
            .from(suppliers)
            .where(eq(suppliers.businessId, user.businessId));
    return { parties, ...(await settlementRegister(tx, user.businessId, side)) };
  });
  const unallocated = data.payments.reduce((n, p) => n + Number(p.unallocated), 0);
  const savedPayment = data.payments.find((p) => p.id === params.recorded);
  const savedAllocation = data.allocations.find((a) => a.id === params.allocated);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settlements</h1>
        <p className="text-sm text-muted-foreground">
          Record money once, then apply it to the correct credit bill.{' '}
          <a href="/cashbook" className="underline">
            Open cashbook
          </a>
        </p>
      </div>
      <nav className="flex flex-wrap gap-4">
        <a
          href="/settlements"
          aria-current={side === 'sales' ? 'page' : undefined}
          className="underline"
        >
          Sales settlements
        </a>
        <a
          href="/settlements?tab=purchases"
          aria-current={side === 'purchases' ? 'page' : undefined}
          className="underline"
        >
          Purchase settlements
        </a>
        <a href={`/settlements/funds?tab=${side}`} className="underline">
          Advances &amp; refunds
        </a>
      </nav>
      {savedPayment && (
        <output className="block rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <span>Settlement recorded.</span> ₹{Number(savedPayment.amount).toFixed(2)} ·{' '}
          {savedPayment.name}
        </output>
      )}
      {savedAllocation && (
        <output className="block rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <span>Allocation saved. No new money was recorded.</span> {savedAllocation.billNo} · ₹
          {Number(savedAllocation.amount).toFixed(2)}
        </output>
      )}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="font-medium">₹{unallocated.toFixed(2)} awaiting bill allocation</p>
        <p className="text-sm text-muted-foreground">
          Earlier payments reduce party debt already. Until assigned, individual bill balances may
          overstate what is still due. Opening-balance notes do not establish opening cash.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PaymentForm
          key={`payment-${side}`}
          side={side}
          parties={data.parties}
          bills={data.bills}
          initialPartyId={side === 'sales' ? params.customerId : params.supplierId}
        />
        <AllocationForm
          key={`allocation-${side}`}
          side={side}
          bills={data.bills}
          payments={data.payments}
        />
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recorded payments</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">Date / party</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Unallocated</th>
                <th className="p-3">Method / reference</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.slice(0, 100).map((p) => (
                <tr className="border-b" key={p.id} id={`payment-${p.id}`}>
                  <td className="p-3">
                    {new Date(p.settledAt).toLocaleDateString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}
                    <br />
                    {p.name}
                    {p.reversed && <span className="block text-xs">Reversed</span>}
                  </td>
                  <td className="p-3 tabular-nums">₹{Number(p.amount).toFixed(2)}</td>
                  <td className="p-3 tabular-nums">₹{Number(p.unallocated).toFixed(2)}</td>
                  <td className="p-3">
                    {p.method}
                    <br />
                    {p.reference ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.payments.length && (
            <p className="p-4 text-sm text-muted-foreground">No settlements recorded.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Latest 100 payments shown. All unallocated payments remain available in the allocation
          form. Evidence is retained; use Advances &amp; refunds for linked corrections.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bill allocation history</h2>
        <p className="text-xs text-muted-foreground">
          Latest 100 allocations. These assign existing money; they are not additional receipts or
          payments.
        </p>
        <div className="space-y-3">
          {data.allocations.map((a) => (
            <article key={a.id} id={`allocation-${a.id}`} className="rounded-lg border p-4 text-sm">
              <p className="font-medium">
                {a.reversed ? 'Reversed · ' : ''}
                {a.billNo} · {a.name} · ₹{Number(a.amount).toFixed(2)}
              </p>
              <p className="break-words text-muted-foreground">{a.note}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
            </article>
          ))}
          {!data.allocations.length && (
            <p className="text-sm text-muted-foreground">No bill allocations recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
