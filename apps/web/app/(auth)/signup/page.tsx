'use client';

import { Button } from '@mybizone/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { signupAction } from '../actions';

export default function SignupPage() {
  const [invitationToken, setInvitationToken] = useState<string | undefined>();
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next') ?? '';
    const match = /^\/accept-invite\/([a-f0-9]{64})$/.exec(next);
    setInvitationToken(match?.[1]);
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await signupAction({
      name: fd.get('name'),
      email: fd.get('email'),
      password: fd.get('password'),
      businessName: invitationToken ? 'Invited employee' : fd.get('businessName'),
      invitationToken,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNeedsVerification(result.needsVerification);
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{needsVerification ? 'Check your email' : 'Your account is ready'}</CardTitle>
          <CardDescription>
            {needsVerification
              ? 'We sent a verification link. Click it to activate your account.'
              : 'Log in to set up your store and add your first products.'}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link
              href={invitationToken ? `/login?next=/accept-invite/${invitationToken}` : '/login'}
            >
              Back to login
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Free. No card required.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {!invitationToken && (
            <div className="space-y-2">
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                name="businessName"
                required
                maxLength={120}
                placeholder="My Shop"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
