'use client';

import { useEffect } from 'react';

const SUPPORT_WA = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: '4rem 1rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ color: '#6b7280' }}>Please reload the page or contact support.</p>
        {error.digest && (
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#9ca3af' }}>
            Ref: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Try again
          </button>
          {SUPPORT_WA && (
            <a
              href={`https://wa.me/${SUPPORT_WA}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.5rem 1rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem', textDecoration: 'none', color: 'inherit' }}
            >
              WhatsApp support
            </a>
          )}
        </div>
      </body>
    </html>
  );
}
