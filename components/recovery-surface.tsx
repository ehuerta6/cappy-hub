import type { ReactNode } from "react";
import { AlertTriangle, FileQuestion, ShieldAlert } from "lucide-react";

const toneIcons = {
  brand: null,
  danger: ShieldAlert,
  warning: AlertTriangle,
  muted: FileQuestion,
} as const;

const toneStyles = {
  brand: "border-brand-border bg-brand-bg text-brand",
  danger: "border-danger-border bg-danger-bg text-danger",
  warning: "border-warning-border bg-warning-bg text-warning",
  muted: "border-border-strong bg-surface-muted text-muted",
} as const;

export function RecoverySurface({
  title,
  description,
  icon = "muted",
  eyebrow,
  headerMedia,
  children,
}: {
  title: string;
  description: string;
  icon?: keyof typeof toneIcons;
  eyebrow?: string;
  headerMedia?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = toneIcons[icon];
  return (
    <main className="flex w-full flex-1 items-center justify-center px-4 py-12">
      <section
        aria-labelledby="recovery-title"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-7"
      >
        {headerMedia ? (
          <div className="mb-4 flex items-center gap-3">{headerMedia}</div>
        ) : Icon ? (
          <div
            className={`mb-4 inline-flex size-10 items-center justify-center rounded-md border ${toneStyles[icon]}`}
          >
            <Icon aria-hidden="true" size={18} />
          </div>
        ) : null}
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
            {eyebrow}
          </p>
        )}
        <h1
          id="recovery-title"
          className="text-xl font-semibold tracking-tight text-foreground"
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
  "inline-flex min-h-11 w-full items-center justify-center gap-2 break-words rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
