'use client';

import Link from 'next/link';

interface Props {
  error: string | null;
}

/**
 * Shown when a server action returns an "upgrade required: ..." error.
 * Falls back to a plain red error message for other errors.
 */
export function UpgradeAlert({ error }: Props) {
  if (!error) return null;

  if (error.startsWith('upgrade required:')) {
    const detail = error.replace('upgrade required: ', '');
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">Free plan limit reached</p>
        <p className="mt-0.5">{detail}</p>
        <Link
          href="/settings/billing"
          className="mt-1.5 inline-block font-medium underline underline-offset-2"
        >
          Upgrade to Pro →
        </Link>
      </div>
    );
  }

  return <p className="text-sm text-destructive">{error}</p>;
}
