'use client';

import { Button } from '@mybizone/ui/button';
import { useEffect } from 'react';

const SUPPORT_WA = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        {SUPPORT_WA ? 'Contact support or try again.' : "We've been notified. Try again."}
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        {SUPPORT_WA && (
          <Button variant="outline" asChild>
            <a
              href={`https://wa.me/${SUPPORT_WA}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp support
            </a>
          </Button>
        )}
      </div>
    </main>
  );
}
