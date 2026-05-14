import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { departments, stores, user as userTable, userRoles } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { AssignRoleForm } from './_components/assign-role-form';
import { RevokeRoleButton } from './_components/revoke-role-button';

export const dynamic = 'force-dynamic';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  shop_manager: 'bg-green-100 text-green-800',
  branch_manager: 'bg-teal-100 text-teal-800',
  floor_manager: 'bg-cyan-100 text-cyan-800',
  sales: 'bg-yellow-100 text-yellow-800',
  marketing: 'bg-pink-100 text-pink-800',
  inventory: 'bg-orange-100 text-orange-800',
  billing: 'bg-indigo-100 text-indigo-800',
  accounts: 'bg-gray-100 text-gray-800',
};

export default async function TeamPage() {
  const user = await requireUser();
  const myRoles = await getUserRoles(user);

  if (!hasPermission(myRoles, 'manage_employees')) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">You don&apos;t have permission to manage team members.</p>
      </div>
    );
  }

  const data = await withTenant(db, user.businessId, async (tx) => {
    const members = await tx
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        active: userTable.active,
      })
      .from(userTable)
      .where(eq(userTable.businessId, user.businessId))
      .orderBy(asc(userTable.name));

    const roleRows = await tx
      .select({
        id: userRoles.id,
        userId: userRoles.userId,
        role: userRoles.role,
        storeId: userRoles.storeId,
        departmentId: userRoles.departmentId,
      })
      .from(userRoles)
      .where(eq(userRoles.businessId, user.businessId));

    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));

    const depts = await tx
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name));

    return { members, roleRows, stores: sts, departments: depts };
  });

  const storeNames = new Map(data.stores.map((s) => [s.id, s.name]));
  const deptNames = new Map(data.departments.map((d) => [d.id, d.name]));

  // Group role rows by userId
  const rolesByUser = new Map<string, typeof data.roleRows>();
  for (const r of data.roleRows) {
    const existing = rolesByUser.get(r.userId) ?? [];
    existing.push(r);
    rolesByUser.set(r.userId, existing);
  }

  const isSuperAdmin = myRoles.some((r) => r.role === 'super_admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team &amp; Roles</h1>
        <Button asChild variant="outline">
          <Link href="/employees/invite">Invite teammate</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Manage role assignments. Each user can hold multiple roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => {
                const roles = rolesByUser.get(m.id) ?? [];
                return (
                  <TableRow key={m.id} className={m.active ? '' : 'opacity-50'}>
                    <TableCell className="font-medium">
                      {m.name}
                      {m.id === user.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">no roles</span>
                        )}
                        {roles.map((r) => (
                          <span
                            key={r.id}
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r.role] ?? 'bg-gray-100 text-gray-800'}`}
                          >
                            {r.role}
                            {r.storeId && (
                              <span className="opacity-70">@ {storeNames.get(r.storeId) ?? r.storeId}</span>
                            )}
                            {r.departmentId && (
                              <span className="opacity-70">/ {deptNames.get(r.departmentId) ?? r.departmentId}</span>
                            )}
                            {/* Cannot revoke own super_admin or revoke if not admin+ */}
                            {!(m.id === user.id && r.role === 'super_admin') && (
                              <RevokeRoleButton userRoleId={r.id} role={r.role} />
                            )}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <AssignRoleForm
                        userId={m.id}
                        stores={data.stores}
                        departments={data.departments}
                        isSuperAdmin={isSuperAdmin}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
