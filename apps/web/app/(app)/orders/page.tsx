import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { canManageOrders } from '@/lib/order-access';
import { moneyCents } from '@/lib/order-policy';
import { loadOrderList } from '@/lib/order-queries';
import { requireUser } from '@/lib/session';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
const money = (cents: number) =>
  `₹${(cents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default async function OrdersPage(props: {
  searchParams: Promise<{
    storeId?: string;
    q?: string;
    view?: string;
    page?: string;
    trade?: string;
  }>;
}) {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const query = await props.searchParams;
  let data: Awaited<ReturnType<typeof loadOrderList>>;
  try {
    data = await loadOrderList(db, user.businessId, roles, query);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !['Permission denied', 'Store is outside your access'].includes(error.message)
    )
      throw error;
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Customer orders</h1>
        <p>Your role does not permit orders in this store.</p>
      </div>
    );
  }
  const pageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (data.storeId) params.set('storeId', data.storeId);
    if (data.q) params.set('q', data.q);
    if (data.view) params.set('view', data.view);
    if (data.trade) params.set('trade', data.trade);
    params.set('page', String(page));
    return `/orders?${params}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Customer orders</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Track agreements, customer advances and physical handovers separately. Orders do not
            reserve stock; a handover creates its own sales bill.
          </p>
          <Link href="/orders?trade=wholesale" className="mt-3 inline-block text-sm underline">
            Wholesale fulfilment
          </Link>
        </div>
        {canManageOrders(roles) && (
          <Link
            href={data.trade === 'wholesale' ? '/orders/new?trade=wholesale' : '/orders/new'}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            New customer order
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Awaiting handover', data.totals.orders],
          ['Past promised date', data.totals.late],
          ['Advances held', money(moneyCents(data.totals.held))],
          ['Unpaid delivered bills', money(moneyCents(data.totals.due))],
        ].map(([label, value]) => (
          <div key={String(label)} className="min-w-0 rounded-xl border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Current totals in your permitted stores and order type, independent of the search filter.
        Advances are unused customer funds, not sales revenue. Unpaid delivered bills are already
        included in customer debt.
      </p>
      <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="min-w-0 text-sm font-medium">
          Order type
          <select
            name="trade"
            defaultValue={data.trade}
            className="mt-1 w-full rounded-md border bg-background p-2"
          >
            <option value="">All types</option>
            <option value="standard">Standard</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          Store
          <select
            name="storeId"
            defaultValue={data.storeId}
            className="mt-1 w-full rounded-md border bg-background p-2"
          >
            <option value="">All permitted stores</option>
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium">
          Order or customer
          <input
            name="q"
            defaultValue={data.q}
            maxLength={100}
            className="mt-1 w-full rounded-md border bg-background p-2"
          />
        </label>
        <label className="min-w-0 text-sm font-medium">
          Progress
          <select
            name="view"
            defaultValue={data.view}
            className="mt-1 w-full rounded-md border bg-background p-2"
          >
            <option value="">All orders</option>
            <option value="pending">Awaiting handover</option>
            <option value="late">Past promised date</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled remainder</option>
          </select>
        </label>
        <div className="flex items-end gap-4">
          <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
            Apply filters
          </button>
          <Link href="/orders" className="py-2 text-sm underline">
            Clear
          </Link>
        </div>
      </form>
      {!data.rows.length && (
        <div className="rounded-xl border p-6">
          <h2 className="font-medium">No customer orders match these filters</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an order when a customer agrees the products, price and promised handover.
            Existing quotations and bills are not automatically converted.
          </p>
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.rows.map((row) => (
          <article key={row.id} className="min-w-0 rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <Link
                href={`/orders/${row.id}`}
                className="font-semibold underline underline-offset-4"
              >
                {row.orderNo}
              </Link>
              <span className="text-xs font-medium">{row.state}</span>
            </div>
            <p className="mt-3 font-medium">{row.customer}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.store}</p>
            {row.tradeType === 'wholesale' && (
              <p className="mt-2 text-xs font-medium">Wholesale fulfilment</p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Promised handover</dt>
                <dd>
                  {row.promisedOn}
                  {row.status === 'open' &&
                    row.delivered < row.qty &&
                    row.promisedOn < data.today && (
                      <span className="ml-2 text-red-700">Past date</span>
                    )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Order balance</dt>
                <dd className="tabular-nums">{money(row.balance)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Unused advance</dt>
                <dd className="tabular-nums">{money(row.held)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Delivered bills due</dt>
                <dd className="tabular-nums">{money(row.due)}</dd>
              </div>
            </dl>
            {row.refundDue > 0 && (
              <p className="mt-3 text-sm font-medium">
                Refund to reconcile: {money(row.refundDue)}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Order balance includes goods not yet delivered; it is not invoice arrears.
            </p>
          </article>
        ))}
      </div>
      <nav aria-label="Orders pagination" className="flex gap-4 text-sm">
        {data.page > 1 && (
          <a className="underline" href={pageUrl(data.page - 1)}>
            Previous page
          </a>
        )}
        {data.page * 50 < data.total && (
          <a className="underline" href={pageUrl(data.page + 1)}>
            Next page
          </a>
        )}
      </nav>
    </div>
  );
}
