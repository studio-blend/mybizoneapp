'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
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
        <h1>Something went wrong</h1>
        <p>Please reload the page.</p>
      </body>
    </html>
  );
}
