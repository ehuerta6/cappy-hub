import type { ReactNode } from "react";
import Link from "next/link";
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-sm text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3 space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
        {title}
      </h2>
      {description && <p className="text-sm text-zinc-400">{description}</p>}
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
      className="inline-flex w-fit items-center justify-center rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
    >
      {children}
    </Link>
  );
}

const badgeTone = {
  neutral: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
  green: "border-emerald-900/80 bg-emerald-950/60 text-emerald-300",
  blue: "border-blue-900/80 bg-blue-950/60 text-blue-300",
  red: "border-red-900/80 bg-red-950/60 text-red-300",
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
        : status === "cancelled" || status === "rejected"
          ? "red"
          : "neutral";
  return <Badge tone={tone}>{formatLabel(status)}</Badge>;
}

export function BranchBadges({ branches }: { branches: string[] }) {
  if (!branches.length) return <span className="text-zinc-500">None</span>;
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
    value > 0
      ? "text-emerald-300"
      : value < 0
        ? "text-red-300"
        : "text-zinc-300";
  return (
    <span className={`tabular-nums font-medium ${tone}`}>
      {value > 0 ? "+" : ""}
      {value.toLocaleString("en-US", { maximumFractionDigits: 6 })}
    </span>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      {children}
    </div>
  );
}
