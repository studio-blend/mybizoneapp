import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { loadWarranties } from '@/lib/warranty-queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function WarrantiesPage(props: {
  searchParams: Promise<{ serial?: string; page?: string }>;
}) {
  const user = await requireUser();
  const query = await props.searchParams;
  const roles = await getUserRoles(user);
  const page = /^[1-9]\d{0,3}$/.test(query.page ?? '') ? Number(query.page) : 1;
  const search = query.serial?.slice(0, 100) ?? '';
  let data: Awaited<ReturnType<typeof loadWarranties>>;
  try {
    data = await loadWarranties(db, user.businessId, roles, search, page);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error.message !== 'Permission denied' && !error.message.startsWith('Serials use'))
    )
      throw error;
    return (
      <div className="rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Warranty lookup</h1>
        <p className="mt-2 text-sm">
          {error.message === 'Permission denied'
            ? 'Your role does not permit sale warranty records.'
            : 'Enter a valid serial number using letters, numbers, dots, slashes, underscores or hyphens.'}
        </p>
        <Link href="/warranties" className="mt-4 inline-block text-sm underline">
          Clear search
        </Link>
      </div>
    );
  }
  const pageUrl = (number: number) =>
    `/warranties?serial=${encodeURIComponent(search)}&page=${number}`;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Warranty lookup</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Find a unit’s recorded sale, issuer and warranty term. Terms are copied onto the sale when
          it is saved. These records do not automatically approve a repair, replacement or refund.
        </p>
      </div>
      <form method="get" className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="min-w-0 text-sm font-medium sm:flex-1">
          Exact serial number
          <input
            name="serial"
            defaultValue={search}
            maxLength={80}
            className="mt-1 w-full rounded-md border bg-background p-2"
            placeholder="Enter or scan the serial"
          />
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Find warranty
        </button>
        <Link href="/warranties" className="py-2 text-sm underline">
          Clear
        </Link>
      </form>
      <p className="text-sm text-muted-foreground">
        Up to 50 sale records per page in your permitted stores. End dates are exclusive, using
        India time. Zero months means no warranty recorded. Returned sales stay visible as history.
      </p>
      {!data.rows.length && (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          No serial sale records match this search. Earlier bills are not assigned invented serials
          or warranty terms.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.rows.map((row) => {
          const status = row.returned
            ? 'Returned'
            : !row.months
              ? 'No warranty recorded'
              : row.endsOn && row.endsOn <= data.today
                ? 'Recorded term ended'
                : 'Within recorded term';
          return (
            <article key={row.id} className="min-w-0 rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="break-all font-mono text-sm font-semibold">{row.code}</h2>
                <span className="text-xs font-medium">{status}</span>
              </div>
              <p className="mt-2 font-medium">{row.product}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.store}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Sale date</dt>
                  <dd>
                    {new Date(row.soldAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Customer on bill</dt>
                  <dd className="break-words">{row.customer ?? 'Walk-in'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recorded term</dt>
                  <dd>{row.months ? `${row.months} months` : 'None recorded'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recorded end (exclusive)</dt>
                  <dd>{row.endsOn ?? '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Issuer on sale</dt>
                  <dd className="break-words">{row.issuer ?? 'None recorded'}</dd>
                </div>
              </dl>
              <Link href={`/sales/${row.saleId}`} className="mt-4 inline-block text-sm underline">
                Open bill {row.billNo}
              </Link>
            </article>
          );
        })}
      </div>
      <nav aria-label="Warranty pagination" className="flex gap-4 text-sm">
        {page > 1 && (
          <a className="underline" href={pageUrl(page - 1)}>
            Previous page
          </a>
        )}
        {data.rows.length === 50 && (
          <a className="underline" href={pageUrl(page + 1)}>
            Next page
          </a>
        )}
      </nav>
    </div>
  );
}
