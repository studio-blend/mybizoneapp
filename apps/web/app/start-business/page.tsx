import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { invitations } from '@mybizone/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBusiness } from './actions';

export default async function StartBusinessPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.businessId) redirect('/dashboard');
  if (!user.emailVerified) redirect('/verify-email');
  const pendingInvites = await db
    .select({ token: invitations.token })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, user.email.toLowerCase()),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Set up your business</h1>
      {pendingInvites.length > 0 && (
        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="font-medium">You have a team invitation</h2>
          <p className="text-sm text-muted-foreground">
            Join your team before creating a separate business.
          </p>
          {pendingInvites.map((invite) => (
            <Link
              className="block underline"
              key={invite.token}
              href={`/accept-invite/${invite.token}`}
            >
              Review invitation
            </Link>
          ))}
        </section>
      )}
      <form action={createBusiness} className="space-y-4">
        <label className="block space-y-2">
          Business name
          <input
            name="name"
            required
            maxLength={120}
            className="block w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Create business
        </button>
      </form>
    </main>
  );
}
