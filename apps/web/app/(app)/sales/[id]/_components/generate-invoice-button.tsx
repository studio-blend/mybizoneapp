'use client';

import { Button } from '@mybizone/ui/button';
import { useToast } from '@mybizone/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { generateInvoiceAction } from '../../../invoices/actions';

interface Props {
  saleId: string;
  existingPdfKey: string | null;
}

export function GenerateInvoiceButton({ saleId, existingPdfKey }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const result = await generateInvoiceAction({ saleId });
    setPending(false);
    if (!result.ok) {
      toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Invoice ${result.data.invoiceNo} ready` });
    router.refresh();
    window.open(`/api/files/${result.data.pdfKey}`, '_blank');
  }

  return (
    <div className="flex gap-2">
      <Button onClick={onClick} disabled={pending}>
        {pending ? 'Generating…' : existingPdfKey ? 'Regenerate invoice' : 'Generate GST invoice'}
      </Button>
      {existingPdfKey && (
        <Button asChild variant="outline">
          <a href={`/api/files/${existingPdfKey}`} target="_blank" rel="noreferrer">
            Download PDF
          </a>
        </Button>
      )}
    </div>
  );
}
