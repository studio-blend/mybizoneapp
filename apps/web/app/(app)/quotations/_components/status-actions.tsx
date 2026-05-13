'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateQuotationStatusAction } from '../actions';

type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

const TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  draft: [
    { value: 'sent', label: 'Mark Sent' },
    { value: 'expired', label: 'Mark Expired' },
  ],
  sent: [
    { value: 'accepted', label: 'Mark Accepted' },
    { value: 'rejected', label: 'Mark Rejected' },
    { value: 'expired', label: 'Mark Expired' },
  ],
  accepted: [],
  rejected: [],
  expired: [],
  converted: [],
};

interface Props {
  id: string;
  currentStatus: string;
}

export function StatusActions({ id, currentStatus }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  const transitions = TRANSITIONS[currentStatus] ?? [];
  if (transitions.length === 0) return null;

  async function handleUpdate(status: string) {
    setPending(true);
    const result = await updateQuotationStatusAction({ id, status: status as QuotationStatus });
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
