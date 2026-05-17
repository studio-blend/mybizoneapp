'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardFooter } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createEmployeeAction } from '../actions';

interface Store {
  id: string;
  name: string;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

export function NewEmployeeForm({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  function validate(fd: FormData) {
    const errs: Record<string, string> = {};
    if (!String(fd.get('name') ?? '').trim()) errs.name = 'Name is required';
    const email = String(fd.get('email') ?? '').trim();
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
    return errs;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const fd = new FormData(e.currentTarget);
    const errs = validate(fd);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setPending(true);
    const result = await createEmployeeAction({
      name: String(fd.get('name')),
      email: String(fd.get('email')),
      role: String(fd.get('role')) as 'admin' | 'employee',
      storeId: String(fd.get('storeId') ?? ''),
    });
    setPending(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setCreated(result.data.empId);
  }

  if (created) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="rounded-md bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">Employee created successfully!</p>
            <p className="text-sm text-muted-foreground">
              Employee ID: <span className="font-mono font-semibold text-foreground">{created}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              A welcome email with login instructions has been sent. The initial password is the Employee ID.
            </p>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => setCreated(null)}>Add another</Button>
          <Button variant="outline" onClick={() => router.push('/employees')}>Back to team</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="emp-name">Full name</Label>
            <Input id="emp-name" name="name" required maxLength={100} />
            <FieldError msg={errors.name} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-email">Email</Label>
            <Input id="emp-email" name="email" type="email" required />
            <FieldError msg={errors.email} />
            <p className="text-xs text-muted-foreground">Used for password reset and notifications.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-role">Role</Label>
            <Select id="emp-role" name="role" defaultValue="employee" className="h-9 text-sm">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          {stores.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="emp-store">Store (optional)</Label>
              <Select id="emp-store" name="storeId" className="h-9 text-sm">
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
            <p>An Employee ID will be auto-generated (e.g. <span className="font-mono">EMPAB12CD</span>).</p>
            <p>The initial password is set to the Employee ID. The employee will be prompted to change it on first login.</p>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create employee'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/employees')}>
            Cancel
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
