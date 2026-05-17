'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toggleLockAction } from '../actions';

export function LockButton({ id, name, locked }: { id: string; name: string; locked: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    const action = locked ? 'unlock' : 'lock';
    if (!confirm(`${action === 'lock' ? 'Lock' : 'Unlock'} account for ${name}?`)) return;
    setPending(true);
    const result = await toggleLockAction({ id, lock: !locked });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: locked ? 'Account unlocked' : 'Account locked' });
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className={locked ? 'text-green-600 hover:text-green-700' : 'text-destructive hover:text-destructive/80'}
    >
      {pending ? '…' : locked ? 'Unlock' : 'Lock'}
    </Button>
  );
}
