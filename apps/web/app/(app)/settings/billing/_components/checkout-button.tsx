'use client';

import { Button } from '@mybizone/ui/button';
import Script from 'next/script';
import { useState } from 'react';
import { createSubscriptionAction } from '../actions';

interface CheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  handler: () => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay: new (
      options: CheckoutOptions,
    ) => {
      open: () => void;
      on: (event: string, callback: () => void) => void;
    };
  }
}

export function CheckoutButton({ interval }: { interval: 'monthly' | 'annual' }) {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const result = await createSubscriptionAction({ interval });
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: result.data.keyId,
        subscription_id: result.data.subscriptionId,
        name: 'MyBizOne',
        description:
          interval === 'annual' ? 'Pro — annual subscription' : 'Pro — monthly subscription',
        handler() {
          setDone(true);
          setPending(false);
        },
        modal: {
          ondismiss() {
            setPending(false);
          },
        },
      });
      rzp.on('payment.failed', () => {
        setError('Payment was not completed. You can try again.');
        setPending(false);
      });
      rzp.open();
    } catch {
      setError('Checkout could not be opened. Please try again.');
      setPending(false);
    }
  }

  if (done) {
    return (
      <output className="block text-sm">
        Checkout completed. Your plan will update after payment confirmation. Refresh this page to
        check its status.
      </output>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() =>
          setError('Payment service could not load. Check your connection and refresh.')
        }
      />
      <Button onClick={handleClick} disabled={pending || !ready}>
        {pending
          ? 'Preparing checkout…'
          : !ready
            ? 'Loading checkout…'
            : 'View price and subscribe'}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
