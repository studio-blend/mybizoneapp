'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateDcStatusAction } from '../actions';

type DcStatus = 'dispatched' | 'delivered' | 'cancelled';

const TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  draft: [
    { value: 'dispatched', label: 'Mark Dispatched' },
    { value: 'cancelled', label: 'Cancel' },
  ],
  dispatched: [
    { value: 'delivered', label: 'Mark Delivered' },
    { value: 'cancelled', label: 'Cancel' },
  ],
  delivered: [],
  cancelled: [],
  converted: [],
};

interface Props {
  id: string;
  currentStatus: string;
}

export function DcStatusActions({ id, currentStatus }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const transitions = TRANSITIONS[currentStatus] ?? [];
  if (transitions.length === 0) return null;

  async function handleUpdate(status: string) {
    setPending(true);
    const result = await updateDcStatusAction({ id, status: status as DcStatus });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Status updated' });
    router.refresh();
  }

  return (
    <>
      {transitions.map((t) => (
        <Button
          key={t.value}
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => handleUpdate(t.value)}
        >
          {t.label}
        </Button>
      ))}
    </>
  );
}
