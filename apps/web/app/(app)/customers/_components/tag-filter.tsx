'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const FILTER_TAGS = ['VIP', 'Wholesale', 'Inactive', 'Regular', 'Bulk Buyer', 'Credit Risk', 'New Customer'];

export function TagFilter({ current }: { current: string | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function select(tag: string | null) {
    const sp = new URLSearchParams(params?.toString() ?? '');
    if (tag) sp.set('tag', tag);
    else sp.delete('tag');
    router.push(`/customers?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Filter by tag:</span>
      <button
        onClick={() => select(null)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          !current
            ? 'bg-foreground text-background border-foreground'
            : 'bg-background text-foreground hover:bg-muted'
        }`}
      >
        All
      </button>
      {FILTER_TAGS.map((t) => (
        <button
          key={t}
          onClick={() => select(t)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            current === t
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-foreground hover:bg-muted'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
