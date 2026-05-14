import { db } from '@/lib/db';
import { getUserRoles } from '@/lib/get-user-roles';
import { requireUser } from '@/lib/session';
import { ownershipTransfers, user as userTable, userRoles } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { TransferForm } from './_components/transfer-form';

export const dynamic = 'force-dynamic';

export default async function TransferOwnershipPage() {
  const user = await requireUser();
  const myRoles = await getUserRoles(user);

  if (!hasPermission(myRoles, 'transfer_ownership')) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Only the business owner can access this page.</p>
      </div>
    );
  }

  const data = await withTenant(db, user.businessId, async (tx) => {
    // Find all admins (users with admin or higher role)
    const adminRoleRows = await tx
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.businessId, user.businessId),
          // Admins who are not the current user
        ),
      );

    // Get users who have admin-level roles (excluding current user)
    const adminUserIds = [
      ...new Set(
        adminRoleRows
          .filter((r) => ['admin', 'shop_manager', 'branch_manager'].includes(r.role) && r.userId !== user.id)
          .map((r) => r.userId),
      ),
    ];

    const admins =
      adminUserIds.length > 0
        ? await tx
            .select({ id: userTable.id, name: userTable.name, email: userTable.email })
            .from(userTable)
            .where(eq(userTable.businessId, user.businessId))
        : [];

    const eligibleAdmins = admins.filter((u) => adminUserIds.includes(u.id));

    // Check pending transfer
    const now = new Date();
    const pendingRows = await tx
      .select({
        id: ownershipTransfers.id,
        toUserId: ownershipTransfers.toUserId,
        token: ownershipTransfers.token,
        expiresAt: ownershipTransfers.expiresAt,
      })
      .from(ownershipTransfers)
      .where(
        and(
          eq(ownershipTransfers.businessId, user.businessId),
          eq(ownershipTransfers.fromUserId, user.id),
          isNull(ownershipTransfers.acceptedAt),
          gt(ownershipTransfers.expiresAt, now),
        ),
      );

    const pending = pendingRows[0] ?? null;

    return { eligibleAdmins, pending };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer Ownership</h1>
        <p className="text-sm text-muted-foreground">
          Transfer business ownership to another admin. They will become super_admin and you will become admin.
        </p>
      </div>

      {data.pending && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Pending Transfer</CardTitle>
            <CardDescription className="text-yellow-700">
              A transfer is pending. Share the token with the recipient or wait for them to accept via the link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Token:</span>{' '}
              <code className="rounded bg-yellow-100 px-2 py-0.5 font-mono text-xs">
                {data.pending.token}
              </code>
            </p>
            <p>
              <span className="font-medium">Accept URL:</span>{' '}
              <span className="text-xs text-muted-foreground">
                /settings/transfer/accept?token={data.pending.token}
              </span>
            </p>
            <p>
              <span className="font-medium">Expires:</span>{' '}
              {new Date(data.pending.expiresAt).toLocaleString('en-IN')}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Initiate Transfer</CardTitle>
          <CardDescription>
            Select an admin to transfer ownership to. They will receive a token to accept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.eligibleAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible admins found. Assign the admin role to a team member first.
            </p>
          ) : (
            <TransferForm
              admins={data.eligibleAdmins}
              pendingTransferId={data.pending?.id ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
