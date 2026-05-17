'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { resetEmployeePasswordAction } from '../actions';

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Reset password for ${name}? Their password will be reset to their Employee ID and they will be asked to change it on next login.`)) return;
    setPending(true);
    const result = await resetEmployeePasswordAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password reset', description: 'A welcome email with new credentials has been sent.' });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? '…' : 'Reset pwd'}
    </Button>
  );
}
