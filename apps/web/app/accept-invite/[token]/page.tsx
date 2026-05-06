import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { auditLogs, invitations, user as userTable } from '@mybizone/db';
import { Button } from '@mybizone/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: { token: string };
}

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = params;

  // Direct DB — no RLS — token acts as capability key.
  const [inv] = await db
    .select({
      id: invitations.id,
      businessId: invitations.businessId,
      email: invitations.email,
      role: invitations.role,
      storeId: invitations.storeId,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .where(eq(invitations.token, token));

  if (!inv) {
    return (
      <Centered>
        <ErrorCard message="Invitation not found or already used." />
      </Centered>
    );
  }

  if (inv.expiresAt < new Date()) {
    return (
      <Centered>
        <ErrorCard message="This invitation link has expired. Ask the admin to send a new one." />
      </Centered>
    );
  }

  if (inv.acceptedAt) {
    return (
      <Centered>
        <ErrorCard message="This invitation has already been accepted." />
      </Centered>
    );
  }

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return (
      <Centered>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>You've been invited</CardTitle>
            <CardDescription>
              Sign in or create an account with <strong>{inv.email}</strong> to accept.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href={`/login?next=/accept-invite/${token}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/signup?next=/accept-invite/${token}`}>Create account</Link>
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  if (sessionUser.email.toLowerCase() !== inv.email.toLowerCase()) {
    return (
      <Centered>
        <ErrorCard
          message={`This invitation was sent to ${inv.email}. Please sign in with that email to accept it.`}
        />
      </Centered>
    );
  }

  // Process acceptance — direct DB, no RLS (user has no businessId yet).
  await db.transaction(async (tx) => {
    await tx
      .update(userTable)
      .set({ businessId: inv.businessId, role: inv.role, storeId: inv.storeId, updatedAt: new Date() })
      .where(eq(userTable.id, sessionUser.id));

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, inv.id));

    await tx.insert(auditLogs).values({
      businessId: inv.businessId,
      actorId: sessionUser.id,
      action: 'invitation.accept',
      entity: 'invitation',
      entityId: inv.id,
      after: { email: sessionUser.email, role: inv.role },
    });
  });

  redirect('/dashboard');
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitation error</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/login">Go to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
