import type { ReactNode } from "react";

export function RecoverySurface({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex w-full flex-1 items-center justify-center py-8">
      <section
        aria-labelledby="recovery-title"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-7"
      >
        <h1
          id="recovery-title"
          className="text-xl font-semibold tracking-tight"
        >
          {title}
        </h1>
        <p className="mt-2 break-words text-sm leading-6 text-secondary">
          {description}
        </p>
        {children}
      </section>
    </main>
  );
}

export const recoveryActionClassName =
  "inline-flex min-h-11 w-full items-center justify-center break-words rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted";
