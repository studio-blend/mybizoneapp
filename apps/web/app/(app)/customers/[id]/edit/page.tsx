import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requirePermission } from '@/lib/require-permission';
import { requireUser } from '@/lib/session';
import { customers } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { CustomerForm } from '../../_components/customer-form';

export const dynamic = 'force-dynamic';

export default async function EditCustomerPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  await requirePermission(user, 'manage_customers');
  const [row] = await withTenant(db, user.businessId, (tx) =>
    tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, params.id), eq(customers.businessId, user.businessId))),
  );
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Edit customer</h1>
      <CustomerForm
        mode="edit"
        canConfigureCredit={hasPermission(await getUserRoles(user), 'manage_expenses')}
        initial={{
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          gstin: row.gstin,
          address: row.address,
          rateCategory: row.rateCategory,
          creditLimit: row.creditLimit,
          creditDays: row.creditDays,
          outstandingBalance: row.outstandingBalance,
        }}
      />
    </div>
  );
}
