import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ownershipTransfers, user as userTable } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { AcceptTransferForm } from './_components/accept-form';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { token?: string };
}

export default async function AcceptOwnershipPage({ searchParams }: Props) {
  const token = searchParams.token ?? '';

  if (!token) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Invalid Link</h1>
        <p className="mt-2 text-muted-foreground">No transfer token provided.</p>
      </div>
    );
  }

  let user: Awaited<ReturnType<typeof requireUser>> | null = null;
  try {
    user = await requireUser();
  } catch {
    // Not logged in — redirect will happen inside requireUser
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Sign In Required</h1>
        <p className="mt-2 text-muted-foreground">Please sign in to accept this transfer.</p>
      </div>
    );
  }

  const now = new Date();

  const data = await withTenant(db, user.businessId, async (tx) => {
    const [transfer] = await tx
      .select({
        id: ownershipTransfers.id,
        fromUserId: ownershipTransfers.fromUserId,
        toUserId: ownershipTransfers.toUserId,
        expiresAt: ownershipTransfers.expiresAt,
      })
      .from(ownershipTransfers)
      .where(
        and(
          eq(ownershipTransfers.token, token),
          isNull(ownershipTransfers.acceptedAt),
          gt(ownershipTransfers.expiresAt, now),
        ),
      );

    if (!transfer) return { transfer: null, fromUser: null };

    const [fromUser] = await tx
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, transfer.fromUserId));

    return { transfer, fromUser: fromUser ?? null };
  });

  if (!data.transfer) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Invalid or Expired Token</h1>
        <p className="mt-2 text-muted-foreground">
          This transfer link is no longer valid. Ask the owner to initiate a new transfer.
        </p>
      </div>
    );
  }

  if (data.transfer.toUserId !== user.id) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">Not Addressed To You</h1>
        <p className="mt-2 text-muted-foreground">
          This ownership transfer was not sent to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">Accept Business Ownership</h1>
        <p className="mt-2 text-muted-foreground">
          {data.fromUser?.name ?? 'The current owner'} ({data.fromUser?.email}) wants to transfer
          ownership of the business to you.
        </p>
      </div>

      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        <p>By accepting:</p>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li>You will become the new <strong>super_admin</strong> (business owner)</li>
          <li>The current owner will become an <strong>admin</strong></li>
          <li>This action cannot be undone without another transfer</li>
        </ul>
      </div>

      <AcceptTransferForm token={token} />
    </div>
  );
}
