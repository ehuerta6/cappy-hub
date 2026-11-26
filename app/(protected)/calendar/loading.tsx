export default function CalendarLoading() {
  return (
    <div aria-busy="true" data-page-width="wide" className="space-y-5">
      <div className="border-b border-border border-l-[3px] border-l-brand pb-4 pl-3.5">
        <div className="h-7 w-36 rounded bg-surface-muted motion-safe:animate-pulse" />
        <p role="status" className="mt-2 text-sm text-muted">
          Loading calendar…
        </p>
      </div>
      <div className="space-y-3 rounded-md border border-border bg-surface p-5">
        <div className="h-9 w-full rounded bg-surface-muted/70 motion-safe:animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 28 }).map((_, index) => (
            <div
              key={index}
              className="h-24 rounded border border-border/60 bg-surface-muted/40 motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
