export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="mx-auto max-w-7xl space-y-6">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="h-24 rounded-xl bg-muted motion-safe:animate-pulse" />
      <div className="h-24 rounded-xl border bg-muted/40" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 rounded-xl bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="h-80 rounded-xl border bg-muted/40" />
        <div className="h-80 rounded-xl border bg-muted/40" />
      </div>
    </div>
  );
}
