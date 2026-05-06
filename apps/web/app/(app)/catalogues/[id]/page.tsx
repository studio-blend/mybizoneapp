import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { catalogues } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CatalogueViewPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [row] = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({ name: catalogues.name, fileKey: catalogues.fileKey })
      .from(catalogues)
      .where(and(eq(catalogues.id, params.id), eq(catalogues.businessId, user.businessId))),
  );
  if (!row) notFound();

  const fileUrl = `/api/files/${row.fileKey}`;
  const isPdf = row.fileKey.endsWith('.pdf');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{row.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={fileUrl} download>
              Download
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/catalogues">Back</Link>
          </Button>
        </div>
      </div>

      {isPdf ? (
        <iframe
          src={fileUrl}
          className="h-[80vh] w-full rounded-md border"
          title={row.name}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileUrl}
          alt={row.name}
          className="max-h-[80vh] w-full rounded-md border object-contain"
        />
      )}
    </div>
  );
}
