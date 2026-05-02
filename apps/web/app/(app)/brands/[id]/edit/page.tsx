import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BrandForm } from '../../_components/brand-form';

export const dynamic = 'force-dynamic';

export default async function EditBrandPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const row = await withTenant(db, user.businessId, async (tx) => {
    const [r] = await tx
      .select({ id: brands.id, name: brands.name, description: brands.description })
      .from(brands)
      .where(and(eq(brands.id, params.id), eq(brands.businessId, user.businessId)));
    return r ?? null;
  });

  if (!row) notFound();
  return (
    <div className="mx-auto max-w-md">
      <BrandForm mode="edit" initial={row} />
    </div>
  );
}
