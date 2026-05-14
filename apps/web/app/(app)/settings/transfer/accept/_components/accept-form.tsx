'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { acceptOwnershipTransferAction } from '../actions';

export function AcceptTransferForm({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onAccept() {
    if (
      !confirm(
        'Are you sure you want to accept ownership? You will become super_admin and the current owner will become admin.',
      )
    )
      return;
    setPending(true);
    const result = await acceptOwnershipTransferAction({ token });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Ownership accepted! Redirecting…' });
    router.push('/dashboard');
  }

  return (
    <Button onClick={onAccept} disabled={pending}>
      {pending ? 'Accepting…' : 'Accept Ownership'}
    </Button>
  );
}
