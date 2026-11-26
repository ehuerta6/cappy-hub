export function DetailPageSkeleton({ label }: { label: string }) {
  return (
    <div
      data-record-page="loading"
      role="status"
      aria-label={label}
      className="space-y-5"
    >
      <div className="h-5 w-28 animate-pulse rounded-md bg-surface-muted" />
      <div className="space-y-2 border-b border-border pb-4">
        <div className="h-8 w-64 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-lg border border-border bg-surface" />
        <div className="h-56 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
      <div className="h-44 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

export function ListSectionSkeleton({
  label,
  rows = 5,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div
      data-page-width="wide"
      role="status"
      aria-label={label}
      className="space-y-5"
    >
      <div className="space-y-2 border-b border-border pb-4">
        <div className="h-8 w-52 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-surface-muted" />
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 p-4">
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-surface-muted" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-surface-muted" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded-md bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
