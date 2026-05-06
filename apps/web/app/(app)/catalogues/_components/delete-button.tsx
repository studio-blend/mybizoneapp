'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteCatalogueAction } from '../actions';

export function DeleteCatalogueButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm(`Delete catalogue "${name}"?`)) return;
    setPending(true);
    const result = await deleteCatalogueAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Catalogue deleted', description: name });
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
