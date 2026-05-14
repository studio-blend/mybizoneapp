import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { departments, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc } from 'drizzle-orm';
import { DepartmentForm } from './_components/department-form';
import { DeleteDepartmentButton } from './_components/delete-department-button';

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const depts = await tx
      .select({
        id: departments.id,
        name: departments.name,
        description: departments.description,
        storeId: departments.storeId,
        createdAt: departments.createdAt,
      })
      .from(departments)
      .orderBy(asc(departments.name));

    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));

    return { depts, stores: sts };
  });

  const storeNames = new Map(data.stores.map((s) => [s.id, s.name]));
  const canManage = ['super_admin', 'admin', 'owner'].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Departments</h1>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Add Department</CardTitle>
            <CardDescription>
              Departments group products and employees within a store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DepartmentForm stores={data.stores} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <CardDescription>{data.depts.length} department(s) in your business.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.depts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No departments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.depts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.storeId ? (storeNames.get(d.storeId) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.description ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <DeleteDepartmentButton id={d.id} name={d.name} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
