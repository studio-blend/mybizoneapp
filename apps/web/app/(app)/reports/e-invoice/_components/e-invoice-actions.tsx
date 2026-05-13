'use client';

import { Button } from '@mybizone/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelIrnAction, generateIrnAction } from '../actions';

interface Props {
  saleId: string;
  eInvoiceId: string | null;
  status: string;
}

export function EInvoiceActions({ saleId, eInvoiceId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateIrnAction({ saleId });
      if ('error' in result) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!eInvoiceId) return;
    const reason = window.prompt('Enter cancellation reason:');
    if (!reason) return;
    setLoading(true);
    setError(null);
    try {
      const result = await cancelIrnAction({ eInvoiceId, reason });
      if ('error' in result) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {status !== 'generated' && status !== 'cancelled' && (
          <Button size="sm" onClick={handleGenerate} disabled={loading}>
            {loading ? '...' : 'Generate IRN'}
          </Button>
        )}
        {status === 'generated' && eInvoiceId && (
          <Button size="sm" variant="destructive" onClick={handleCancel} disabled={loading}>
            {loading ? '...' : 'Cancel IRN'}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
