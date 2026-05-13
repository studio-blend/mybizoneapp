'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteCustomerAction } from '../actions';

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Delete customer "${name}"?`)) return;
    setPending(true);
    const result = await deleteCustomerAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Customer deleted', description: name });
    router.refresh();
  }

  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
