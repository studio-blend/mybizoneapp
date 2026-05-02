'use client';

import { resetPassword } from '@/lib/auth-client';
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
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get('token') ?? '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      setError('missing reset token');
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await resetPassword({
      newPassword: String(fd.get('password')),
      token,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'failed');
      return;
    }
    router.push('/login');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Pick something at least 8 characters long.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
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
            {pending ? 'Updating…' : 'Update password'}
          </Button>
          <Link href="/login" className="text-sm text-muted-foreground underline">
            Back to login
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
