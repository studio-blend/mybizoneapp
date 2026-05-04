import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { invitations, stores, user as userTable } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc, desc, eq } from 'drizzle-orm';
import Link from 'next/link';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team</h1>
        <Button asChild>
          <Link href="/employees/invite">Invite teammate</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Owners and admins can edit any product, employees scope to their store.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.employees.map((e) => (
                <TableRow key={e.id} className={e.active ? '' : 'opacity-50'}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.email}</TableCell>
                  <TableCell>{e.role}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.storeId ? (storeNames.get(e.storeId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {!e.active && <span className="text-destructive">deactivated</span>}
                    {e.active && !e.emailVerified && (
                      <span className="text-muted-foreground">unverified</span>
                    )}
                    {e.active && e.emailVerified && (
                      <span className="text-muted-foreground">active</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.id === user.id || e.role === 'owner' ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/employees/${e.id}/edit`}>Edit</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>Open links expire 7 days after creation.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.pending.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
