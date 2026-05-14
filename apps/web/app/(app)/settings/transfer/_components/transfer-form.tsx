'use client';

import { Button } from '@mybizone/ui/button';
import { Label } from '@mybizone/ui/label';
import { Select } from '@mybizone/ui/select';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  cancelOwnershipTransferAction,
  initiateOwnershipTransferAction,
} from '../actions';

interface Admin {
  id: string;
  name: string;
  email: string;
}

interface Props {
  admins: Admin[];
  pendingTransferId: string | null;
}

export function TransferForm({ admins, pendingTransferId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [toUserId, setToUserId] = useState('');

  async function onInitiate(e: React.FormEvent) {
    e.preventDefault();
    if (!toUserId) return;
    if (
      !confirm(
        'Are you sure? You will permanently give up super_admin status and become admin.',
      )
    )
      return;
    setPending(true);
    const result = await initiateOwnershipTransferAction({ toUserId });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Transfer initiated',
      description: `Token: ${result.data.token} (expires ${new Date(result.data.expiresAt).toLocaleString('en-IN')})`,
    });
    router.refresh();
  }

  async function onCancel() {
    if (!pendingTransferId) return;
    if (!confirm('Cancel the pending ownership transfer?')) return;
    setPending(true);
    const result = await cancelOwnershipTransferAction({ transferId: pendingTransferId });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Transfer cancelled' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onInitiate} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="to-user">Transfer to</Label>
          <Select
            id="to-user"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            required
            disabled={!!pendingTransferId}
          >
            <option value="">Select admin…</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.email})
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending || !toUserId || !!pendingTransferId}>
          {pending ? 'Initiating…' : 'Initiate Transfer'}
        </Button>
      </form>

      {pendingTransferId && (
        <Button variant="ghost" onClick={onCancel} disabled={pending} className="text-destructive">
          Cancel Pending Transfer
        </Button>
      )}
    </div>
  );
}
