'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get('newPassword'));
    const confirm = String(fd.get('confirm'));

    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: String(fd.get('currentPassword')),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to change password');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change your password</CardTitle>
        <CardDescription>
          You must set a new password before continuing.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Your initial / current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Set new password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
