import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { NewEmployeeForm } from '../_components/new-employee-form';

export default async function NewEmployeePage() {
  const user = await requireUser();
  if (!['owner', 'admin'].includes(user.role)) redirect('/employees');

  const storeList = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
  );

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Add Employee</h1>
      <NewEmployeeForm stores={storeList} />
    </div>
  );
}
