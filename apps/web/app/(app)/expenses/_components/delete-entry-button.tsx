'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteExpenseEntryAction } from '../actions';

interface Props {
  id: string;
}

export function DeleteEntryButton({ id }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!confirm('Delete this entry?')) return;
    setPending(true);
    const result = await deleteExpenseEntryAction({ id });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Entry deleted' });
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? '…' : 'Delete'}
    </Button>
  );
}
