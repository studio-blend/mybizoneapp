'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteSupplierAction } from '../actions';

export function DeleteSupplierButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Delete supplier "${name}"? This cannot be undone.`)) return;
    setPending(true);
    const result = await deleteSupplierAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed to delete', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Supplier deleted', description: name });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} className="text-destructive hover:text-destructive">
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
