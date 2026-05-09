'use client';

import { Button } from '@mybizone/ui/button';
import Script from 'next/script';
import { useState } from 'react';
import { createSubscriptionAction } from '../actions';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

export function CheckoutButton({ interval }: { interval: 'monthly' | 'annual' }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await createSubscriptionAction({ interval });
    setPending(false);

    if (!result.ok) {
      alert(result.error);
      return;
    }

    const { subscriptionId, keyId } = result.data;
    const rzp = new window.Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: 'MyBizOne',
      description: interval === 'annual' ? 'Pro — Annual (₹4,999/yr)' : 'Pro — Monthly (₹499/mo)',
      theme: { color: '#16a34a' },
      handler() {
        setDone(true);
      },
    });
    rzp.open();
  }

  if (done) {
    return (
      <p className="text-sm text-green-700 dark:text-green-400">
        Payment received — your plan will upgrade within a minute.
      </p>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Button onClick={handleClick} disabled={pending}>
        {pending ? 'Preparing checkout…' : interval === 'annual' ? 'Upgrade — ₹4,999/yr' : 'Upgrade — ₹499/mo'}
      </Button>
    </>
  );
}
