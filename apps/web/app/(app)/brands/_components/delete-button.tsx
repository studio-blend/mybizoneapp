'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteBrandAction } from '../actions';

export function DeleteBrandButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Delete brand "${name}"?`)) return;
    setPending(true);
    const result = await deleteBrandAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Brand deleted', description: name });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
