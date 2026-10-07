export default function Loading() {
  return (
    <div aria-busy="true" className="min-h-64 min-w-0 max-w-full py-6 sm:py-8">
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-muted"
      >
        Loading page…
      </p>
    </div>
  );
}
