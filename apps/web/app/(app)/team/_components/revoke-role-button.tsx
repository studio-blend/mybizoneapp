'use client';

import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { revokeRoleAction } from '../actions';

export function RevokeRoleButton({ userRoleId, role }: { userRoleId: string; role: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Remove role "${role}"?`)) return;
    setPending(true);
    const result = await revokeRoleAction({ userRoleId });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Role "${role}" removed` });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="ml-1 text-xs opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
      title={`Remove ${role} role`}
    >
      {pending ? '…' : '×'}
    </button>
  );
}
