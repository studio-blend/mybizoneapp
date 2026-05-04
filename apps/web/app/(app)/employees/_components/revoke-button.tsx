'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { revokeInvitationAction } from '../actions';

export function RevokeInvitationButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Revoke invitation to ${email}?`)) return;
    setPending(true);
    const result = await revokeInvitationAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Invitation revoked' });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? '…' : 'Revoke'}
    </Button>
  );
}
