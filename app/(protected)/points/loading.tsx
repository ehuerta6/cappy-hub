export default function PointsLoading() {
  return (
    <div aria-busy="true" data-page-width="wide" className="space-y-5">
      <div className="border-b border-border border-l-[3px] border-l-brand pb-4 pl-3.5">
        <div className="h-7 w-28 rounded bg-surface-muted motion-safe:animate-pulse" />
        <p role="status" className="mt-2 text-sm text-muted">
          Loading points…
        </p>
      </div>
      <div className="h-10 w-44 rounded bg-surface-muted/60 motion-safe:animate-pulse" />
      <div className="space-y-2 rounded-md border border-border bg-surface p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-9 rounded bg-surface-muted/70 motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
