'use client';

import { signIn } from '@/lib/auth-client';
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

type Tab = 'owner' | 'employee';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get('next') ?? '/dashboard';
  const [tab, setTab] = useState<Tab>('owner');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onOwnerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await signIn.email({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'Login failed');
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onEmployeeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/emp-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId: String(fd.get('empId')),
          password: String(fd.get('password')),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }
      if (data.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push(next);
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function onGoogleSignIn() {
    setError(null);
    setPending(true);
    await signIn.social({ provider: 'google', callbackURL: next });
    setPending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in to MyBizOne</CardTitle>
        <CardDescription>
          {tab === 'owner' ? 'Owner / Admin login' : 'Employee login'}
        </CardDescription>
      </CardHeader>

      {/* Tabs */}
      <div className="px-6 pb-2">
        <div className="flex rounded-md border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => { setTab('owner'); setError(null); }}
            className={`flex-1 py-1.5 transition-colors ${tab === 'owner' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Owner / Admin
          </button>
          <button
            type="button"
            onClick={() => { setTab('employee'); setError(null); }}
            className={`flex-1 py-1.5 transition-colors ${tab === 'employee' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Employee
          </button>
        </div>
      </div>

      {tab === 'owner' ? (
        <form onSubmit={onOwnerSubmit}>
          <CardContent className="space-y-4">
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
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Logging in…' : 'Log in'}
            </Button>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={onGoogleSignIn}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
            <div className="flex w-full justify-between text-sm text-muted-foreground">
              <Link href="/signup" className="underline">Sign up</Link>
              <Link href="/forgot-password" className="underline">Forgot password?</Link>
            </div>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={onEmployeeSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empId">Employee ID</Label>
              <Input
                id="empId"
                name="empId"
                type="text"
                required
                placeholder="e.g. EMP1A2B3C"
                autoComplete="username"
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empPassword">Password</Label>
              <Input
                id="empPassword"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Logging in…' : 'Log in'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Your Employee ID was sent to your email when your account was created.
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
