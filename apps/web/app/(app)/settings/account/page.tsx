import { requireUser } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function MyAccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Account</h1>
        <p className="text-sm text-muted-foreground">Your profile and account details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <div className="flex items-center justify-between py-3 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{user.name || '—'}</dd>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{user.role.replace('_', ' ')}</dd>
            </div>
            <div className="flex items-center justify-between py-3 text-sm">
              <dt className="text-muted-foreground">Email verified</dt>
              <dd className="font-medium">{user.emailVerified ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your password and session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            To change your password, use the forgot password flow from the login page.
          </p>
          <Link href="/settings/transfer" className="text-sm underline underline-offset-4 hover:text-primary">
            Transfer business ownership
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
