export default function OfficersLoading() {
  return (
    <div aria-busy="true" data-page-width="wide" className="space-y-5">
      <div className="border-b border-border border-l-[3px] border-l-brand pb-4 pl-3.5">
        <div className="h-7 w-32 rounded bg-surface-muted motion-safe:animate-pulse" />
        <p role="status" className="mt-2 text-sm text-muted">
          Loading officers…
        </p>
      </div>
      <div className="h-20 rounded-md border border-border bg-surface motion-safe:animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-44 rounded-lg border border-border bg-surface motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
