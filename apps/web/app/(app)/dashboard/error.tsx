'use client';
import Link from 'next/link';
export default function DashboardError({
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-2xl rounded-xl border p-8">
      <h1 className="text-xl font-semibold">Dashboard couldn’t load</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Your data is safe. Try loading this view again or return to your default workspace.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm">
          Reset dashboard filters
        </Link>
      </div>
    </div>
  );
}
