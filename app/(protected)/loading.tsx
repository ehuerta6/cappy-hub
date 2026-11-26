export default function Loading() {
  return (
    <div
      aria-busy="true"
      className="min-h-64 min-w-0 max-w-full space-y-5 py-6 sm:py-8"
    >
      <div className="border-b border-border border-l-[3px] border-l-brand pb-4 pl-3.5">
        <div aria-hidden="true" className="h-7 w-44 rounded bg-surface-muted" />
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-2 text-sm text-muted"
        >
          Loading page…
        </p>
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-md border border-border bg-surface" />
        <div className="h-20 rounded-md border border-border bg-surface" />
        <div className="h-20 rounded-md border border-border bg-surface" />
      </div>
      <div
        aria-hidden="true"
        className="h-56 rounded-md border border-border bg-surface"
      />
    </div>
  );
}
