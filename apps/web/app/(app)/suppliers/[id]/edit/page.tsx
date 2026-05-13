import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { suppliers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { SupplierForm } from '../../_components/supplier-form';

export const dynamic = 'force-dynamic';

export default async function EditSupplierPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const row = await withTenant(db, user.businessId, async (tx) => {
    const [r] = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        phone: suppliers.phone,
        email: suppliers.email,
        gstin: suppliers.gstin,
        address: suppliers.address,
        outstandingBalance: suppliers.outstandingBalance,
      })
      .from(suppliers)
      .where(and(eq(suppliers.id, params.id), eq(suppliers.businessId, user.businessId)));
    return r ?? null;
  });

  if (!row) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Edit supplier</h1>
      <SupplierForm mode="edit" initial={row} />
    </div>
  );
}
