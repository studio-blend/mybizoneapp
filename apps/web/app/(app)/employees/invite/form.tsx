'use client';

import { UpgradeAlert } from '@/components/upgrade-alert';
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
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { createInvitationAction } from '../actions';

interface Props {
  stores: Array<{ id: string; name: string }>;
}

export function InviteForm({ stores }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const result = await createInvitationAction({
      email: fd.get('email'),
      role: fd.get('role'),
      storeId: fd.get('storeId') ?? '',
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({ title: 'Invitation sent', description: 'They will receive an email shortly.' });
    router.push('/employees');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite teammate</CardTitle>
        <CardDescription>
          They'll receive an email with a link valid for 7 days.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" required defaultValue="employee">
              <option value="admin">Admin (full access)</option>
              <option value="employee">Employee (POS + product browse)</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeId">Store (optional, leave blank for all)</Label>
            <Select id="storeId" name="storeId" defaultValue="">
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <UpgradeAlert error={error} />
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Sending…' : 'Send invitation'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
