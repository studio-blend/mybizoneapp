import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { asc } from 'drizzle-orm';
import { InviteForm } from './form';

export const dynamic = 'force-dynamic';

export default async function InviteEmployeePage() {
  const user = await requireUser();
  const sts = await withTenant(db, user.businessId, (tx) =>
    tx.select({ id: stores.id, name: stores.name }).from(stores).orderBy(asc(stores.name)),
  );
  return (
    <div className="mx-auto max-w-md">
      <InviteForm stores={sts} />
    </div>
  );
}
