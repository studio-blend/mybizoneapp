import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { canCollectOrders, canManageOrders } from '@/lib/order-access';
import { moneyCents, orderFulfilment } from '@/lib/order-policy';
import { loadOrderDetail } from '@/lib/order-queries';
import { requireUser } from '@/lib/session';
import { hasPermission } from '@mybizone/domain';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod/v3';
import {
  CancelOrderForm,
  OrderDeliveryForm,
  OrderPaymentForm,
  RescheduleOrderForm,
} from './order-forms';
export const dynamic = 'force-dynamic';
const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const data = await loadOrderDetail(db, user.businessId, roles, id);
  if (!data) notFound();
  const { order, items, ledger, payments } = data;
  const pending = order.status === 'open' && items.some((i) => Number(i.delivered) < Number(i.qty));
  const manage = canManageOrders(roles);
  const collect = canCollectOrders(roles);
  const canOpenBills = hasPermission(roles, 'view_sales', { storeId: order.storeId });
  const state = orderFulfilment(
    order.status,
    items.reduce((n, i) => n + Number(i.qty), 0),
    items.reduce((n, i) => n + Number(i.delivered), 0),
  );
  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="text-sm underline">
          Customer orders
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{order.orderNo}</h1>
          <span className="rounded-md bg-muted px-3 py-1 text-sm font-medium">{state}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.store} ·{' '}
          {order.billType === 'gst_bill' ? 'GST delivery bills' : 'Non-GST delivery bills'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Order finances">
        {[
          ['Current order value', money(ledger.target)],
          ['Net receipts', money(ledger.received)],
          ['Unused advance held', money(ledger.held)],
          ['Order balance', money(ledger.balance)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 break-words text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Order balance includes undelivered commitments. Delivered bills still unpaid:{' '}
        <strong>{money(ledger.due)}</strong>, already included in customer debt. Advances are not
        sales revenue. Returns reduce the order value; they do not reopen a replacement quantity.
      </p>
      {ledger.refundDue > 0 && (
        <p className="rounded-lg border border-amber-500 p-4 text-sm">
          Customer funds exceed the current agreement by {money(ledger.refundDue)}. Reconcile and
          record the actual refund from the unused advance.
        </p>
      )}
      <section
        className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
        aria-label="Handover arrangements"
      >
        <div>
          <h2 className="font-semibold">{order.customerName}</h2>
          {order.customerPhone && <p className="mt-1 text-sm">{order.customerPhone}</p>}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">{order.deliveryAddress}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Promised handover</p>
          <p className="mt-1 font-medium">{order.promisedOn}</p>
          {pending && order.promisedOn < data.today && (
            <p className="mt-2 text-sm text-red-700">Past promised date</p>
          )}
          {order.notes && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">{order.notes}</p>
          )}
        </div>
      </section>
      <section aria-label="Agreed order items" className="space-y-3">
        <h2 className="text-lg font-semibold">Items and handover progress</h2>
        {items.map((item) => (
          <article
            key={item.id}
            className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-2"
          >
            <div>
              <h3 className="font-medium">{item.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Agreed unit price {money(moneyCents(item.unitPrice))} · line total{' '}
                {money(moneyCents(item.total))}
              </p>
            </div>
            <div>
              <p className="text-sm tabular-nums">
                {item.delivered} / {item.qty} {item.unit} handed over
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {Number(item.qty) - Number(item.delivered)} {item.unit} remaining
                {order.status === 'cancelled' ? ' · remainder cancelled' : ''}
              </p>
              <div className="mt-2 h-1.5 rounded bg-muted" aria-hidden="true">
                <div
                  className="h-full rounded bg-emerald-700"
                  style={{ width: `${(Number(item.delivered) / Number(item.qty)) * 100}%` }}
                />
              </div>
            </div>
          </article>
        ))}
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {collect && ledger.balance > 0 && (
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Record customer payment</summary>
            <div className="mt-4">
              <OrderPaymentForm orderId={id} kind="receipt" max={ledger.balance} />
            </div>
          </details>
        )}
        {collect && ledger.held > 0 && (
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Refund unused advance</summary>
            <div className="mt-4">
              <OrderPaymentForm orderId={id} kind="refund" max={ledger.held} />
            </div>
          </details>
        )}
        {manage && pending && (
          <details className="rounded-xl border p-4 lg:col-span-2">
            <summary className="cursor-pointer font-semibold">Record physical handover</summary>
            <div className="mt-4 max-w-3xl">
              <OrderDeliveryForm orderId={id} items={items} />
            </div>
          </details>
        )}
        {manage && pending && (
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Change handover arrangements</summary>
            <div className="mt-4">
              <RescheduleOrderForm
                orderId={id}
                promisedOn={order.promisedOn}
                address={order.deliveryAddress}
              />
            </div>
          </details>
        )}
        {manage && pending && (
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">Cancel undelivered remainder</summary>
            <div className="mt-4">
              <CancelOrderForm orderId={id} held={ledger.held} />
            </div>
          </details>
        )}
      </div>
      <section className="space-y-3" aria-label="Order delivery bills">
        <h2 className="text-lg font-semibold">Delivery bills</h2>
        {!ledger.deliveries.length && (
          <p className="text-sm text-muted-foreground">
            No goods handed over yet. Saving the order and receiving an advance do not create a
            sale.
          </p>
        )}
        {ledger.deliveries
          .slice(-100)
          .reverse()
          .map((d) => {
            const net = moneyCents(d.total) - moneyCents(d.returned);
            const applied = moneyCents(d.applied);
            return (
              <article key={d.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  {canOpenBills ? (
                    <Link href={`/sales/${d.saleId}`} className="font-medium underline">
                      {d.billNo}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.billNo}</span>
                  )}
                  <span className="text-xs">
                    {applied >= net ? 'Paid' : applied ? 'Part paid' : 'Unpaid'}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Bill after returns</dt>
                    <dd>{money(net)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Payment applied</dt>
                    <dd>{money(applied)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Still due</dt>
                    <dd>{money(net - applied)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
      </section>
      <section className="space-y-3" aria-label="Order receipt history">
        <h2 className="text-lg font-semibold">Receipts and refunds</h2>
        <p className="text-xs text-muted-foreground">
          Latest 100 records. Totals above include the complete ledger. These records do not
          initiate bank transfers.
        </p>
        {!payments.length && (
          <p className="text-sm text-muted-foreground">No money recorded for this order.</p>
        )}
        {payments.map((p) => (
          <article key={p.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <span className="font-medium">
                {p.kind === 'receipt' ? 'Received' : 'Refunded'} · {p.method.replaceAll('_', ' ')}
              </span>
              <span className="tabular-nums">{money(moneyCents(p.amount))}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              {p.reference ? ` · ${p.reference}` : ''}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.note}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
