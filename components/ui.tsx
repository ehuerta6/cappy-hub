import type { ReactNode } from "react";
import Link from "next/link";
import { displayPoints } from "@/lib/participation";
import { formatLabel } from "@/lib/presentation";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action && (
        <div className="min-w-0 shrink-0 sm:max-w-[50%]">{action}</div>
      )}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
    >
      {children}
    </Link>
  );
}

const badgeTone = {
  neutral: "border-border-strong bg-surface-muted text-secondary",
  green: "border-success-border bg-success-bg text-success",
  blue: "border-info-border bg-info-bg text-info",
  red: "border-danger-border bg-danger-bg text-danger",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "happening" || status === "approved"
      ? "green"
      : status === "upcoming" || status === "pending"
        ? "blue"
        : status === "cancelled" ||
            status === "rejected" ||
            status === "removed"
          ? "red"
          : "neutral";
  return <Badge tone={tone}>{formatLabel(status)}</Badge>;
}

export function BranchBadges({ branches }: { branches: string[] }) {
  if (!branches.length) return <span className="text-subtle">None</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {branches.map((branch) => (
        <Badge key={branch}>{formatLabel(branch)}</Badge>
      ))}
    </span>
  );
}

export function PointValue({ value }: { value: number }) {
  const tone =
    value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-secondary";
  return (
    <span className={`tabular-nums font-medium ${tone}`}>
      {displayPoints(value)}
    </span>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {children}
    </div>
  );
}
