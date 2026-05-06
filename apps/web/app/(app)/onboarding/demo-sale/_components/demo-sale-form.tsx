'use client';

import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { useToast } from '@mybizone/ui/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSaleAction } from '../../../sales/actions';

interface Props {
  storeId: string;
  productId: string;
  productName: string;
}

export function DemoSaleForm({ storeId, productId, productName }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setPending(true);
    const result = await createSaleAction({
      storeId,
      paymentMethod: 'cash',
      discount: '0',
      notes: 'Onboarding demo sale',
      isInterstate: false,
      lines: [{ productId, qty: '1' }],
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({
      title: `Demo bill ${result.data.billNo} created`,
      description: 'Your system is ready. Go ahead and explore!',
    });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record your first sale</CardTitle>
        <CardDescription>
          This creates a real bill so you can see how the system works. You can delete it later
          from the Sales page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4 text-sm">
          <div className="flex justify-between">
            <span>{productName}</span>
            <span>₹100.00 × 1</span>
          </div>
          <div className="mt-2 border-t pt-2 font-semibold flex justify-between">
            <span>Total</span>
            <span>₹100.00</span>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={onSubmit} disabled={pending}>
          {pending ? 'Recording…' : 'Complete demo sale'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/dashboard" className="underline">
            Skip — I'll explore on my own
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
