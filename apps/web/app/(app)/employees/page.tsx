import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { invitations, stores, user as userTable } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { LockButton } from './_components/lock-button';
import { ResetPasswordButton } from './_components/reset-password-button';
import { RevokeInvitationButton } from './_components/revoke-button';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const user = await requireUser();
  const data = await withTenant(db, user.businessId, async (tx) => {
    const employees = await tx
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        active: userTable.active,
        storeId: userTable.storeId,
        emailVerified: userTable.emailVerified,
        empId: userTable.empId,
        lockedAt: userTable.lockedAt,
        mustChangePassword: userTable.mustChangePassword,
      })
      .from(userTable)
      .where(eq(userTable.businessId, user.businessId))
      .orderBy(asc(userTable.role), asc(userTable.name));
    const sts = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    const pending = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        storeId: invitations.storeId,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(eq(invitations.businessId, user.businessId))
      .orderBy(desc(invitations.createdAt));
    const pendingOpen = pending.filter((p) => p.expiresAt > new Date());
    return { employees, stores: sts, pending: pendingOpen };
  });

  const storeNames = new Map(data.stores.map((s) => [s.id, s.name]));
  const isOwnerOrAdmin = ['owner', 'admin'].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team</h1>
        {isOwnerOrAdmin && (
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/employees/new">Add Employee</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/employees/invite">Send Invite</Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Owners and admins have full access. Employees are scoped to their store.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Emp ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Status</TableHead>
                {isOwnerOrAdmin && <TableHead className="w-48 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.employees.map((e) => {
                const locked = !!e.lockedAt;
                const isMe = e.id === user.id;
                const isOwner = e.role === 'owner';
                return (
                  <TableRow key={e.id} className={!e.active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.empId ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{e.email}</TableCell>
                    <TableCell className="capitalize">{e.role}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.storeId ? (storeNames.get(e.storeId) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {!e.active && <span className="text-destructive font-medium">deactivated</span>}
                      {e.active && locked && <span className="text-orange-600 font-medium">locked</span>}
                      {e.active && !locked && e.mustChangePassword && (
                        <span className="text-yellow-600">pwd reset pending</span>
                      )}
                      {e.active && !locked && !e.mustChangePassword && (
                        <span className="text-muted-foreground">active</span>
                      )}
                    </TableCell>
                    {isOwnerOrAdmin && (
                      <TableCell className="text-right">
                        {isMe || isOwner ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            {e.empId && (
                              <>
                                <LockButton id={e.id} name={e.name} locked={locked} />
                                <ResetPasswordButton id={e.id} name={e.name} />
                              </>
                            )}
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/employees/${e.id}/edit`}>Edit</Link>
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Open links expire 7 days after creation.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-32 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>{p.role}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.storeId ? (storeNames.get(p.storeId) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.expiresAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeInvitationButton id={p.id} email={p.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
