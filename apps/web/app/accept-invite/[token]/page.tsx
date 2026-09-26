import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { invitations } from '@mybizone/db';
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
import { acceptInvitation } from '../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage(props: Props) {
  const params = await props.params;
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

  if (sessionUser.businessId) {
    return (
      <Centered>
        <ErrorCard message="This account already belongs to a business. Use a separate email address for the invitation." />
      </Centered>
    );
  }

  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle>Join this business</CardTitle>
          <CardDescription>Accept the invitation for {sessionUser.email}.</CardDescription>
        </CardHeader>
        <CardFooter>
          <form action={acceptInvitation.bind(null, token)}>
            <Button type="submit">Accept invitation</Button>
          </form>
        </CardFooter>
      </Card>
    </Centered>
  );
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
