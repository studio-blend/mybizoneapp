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
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { deactivateEmployeeAction, updateEmployeeAction } from '../../actions';

interface Props {
  employee: {
    id: string;
    name: string;
    email: string;
    role: string;
    storeId: string | null;
  };
  stores: Array<{ id: string; name: string }>;
}

export function EditEmployeeForm({ employee, stores }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await updateEmployeeAction({
      id: employee.id,
      role: fd.get('role'),
      storeId: fd.get('storeId') ?? '',
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Employee updated' });
    router.push('/employees');
    router.refresh();
  }

  async function onDeactivate() {
    if (!confirm(`Deactivate ${employee.name}? They will not be able to sign in.`)) return;
    setPending(true);
    const result = await deactivateEmployeeAction({ id: employee.id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Employee deactivated' });
    router.push('/employees');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{employee.name}</CardTitle>
        <CardDescription>{employee.email}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" defaultValue={employee.role}>
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeId">Store</Label>
            <Select id="storeId" name="storeId" defaultValue={employee.storeId ?? ''}>
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onDeactivate} disabled={pending}>
            Deactivate
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
