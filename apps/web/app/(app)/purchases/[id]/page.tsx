import { db } from '@/lib/db';
import { packDescription } from '@/lib/pack-policy';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { purchaseItems, purchases } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function PurchasePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireUser();
  await requirePermission(user, 'manage_purchases');
  const data = await withTenant(db, user.businessId, async (tx) => {
    const [receipt] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, id), eq(purchases.businessId, user.businessId)));
    if (!receipt) return null;
    const items = await tx
      .select()
      .from(purchaseItems)
      .where(eq(purchaseItems.purchaseId, receipt.id))
      .orderBy(asc(purchaseItems.id));
    return { receipt, items };
  });
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/purchases" className="text-sm underline">
        Purchase bills
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{data.receipt.billNo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.receipt.supplierName} ·{' '}
          {data.receipt.purchaseDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} ·{' '}
          {data.receipt.paymentMethod}
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Received items</h2>
        {data.items.map((item) => (
          <article key={item.id} className="min-w-0 space-y-2 rounded-xl border p-4">
            <h3 className="font-semibold">{item.productName}</h3>
            {item.packSnapshot && (
              <p className="break-words text-sm text-muted-foreground">
                {packDescription(item.packSnapshot)}
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <p>
                Received: {item.qty} {item.unitSymbol} · ₹{item.unitPrice} per {item.unitSymbol}
              </p>
              <p className="font-medium">₹{item.lineTotal}</p>
            </div>
          </article>
        ))}
      </section>
      <p className="text-right text-lg font-semibold">Receipt total: ₹{data.receipt.total}</p>
      <p className="text-xs text-muted-foreground">
        Quantities and returns use the recorded stock unit. Pack notes retain the conversion used at
        receipt. Purchase costs follow the existing receipt accounting rules.
      </p>
    </div>
  );
}
