'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteDepartmentAction } from '../actions';

export function DeleteDepartmentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Delete department "${name}"? This cannot be undone.`)) return;
    setPending(true);
    const result = await deleteDepartmentAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Department deleted' });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} className="text-destructive hover:text-destructive">
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
