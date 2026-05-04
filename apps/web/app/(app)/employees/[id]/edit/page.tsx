import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { stores, user as userTable } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, asc, eq, ne } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { EditEmployeeForm } from './form';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (params.id === user.id) notFound();

  const data = await withTenant(db, user.businessId, async (tx) => {
    const [row] = await tx
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        storeId: userTable.storeId,
      })
      .from(userTable)
      .where(
        and(
          eq(userTable.id, params.id),
          eq(userTable.businessId, user.businessId),
          ne(userTable.role, 'owner'),
        ),
      );
    if (!row) return null;
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    return { row, stores: sts };
  });
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-md">
      <EditEmployeeForm
        employee={{
          id: data.row.id,
          name: data.row.name,
          email: data.row.email,
          role: data.row.role,
          storeId: data.row.storeId,
        }}
        stores={data.stores}
      />
    </div>
  );
}
