import Link from "next/link";
import type { Route } from "next";
import { withReturnTo } from "@/lib/return-context";
import PointTransactionTable from "@/components/point-transaction-table";
import { SectionHeading, TableFrame } from "@/components/ui";
import type { ComponentProps } from "react";

export function EventLinkedTasksSection({
  linkedTasks,
  contextualReturnTo,
}: {
  linkedTasks: {
    id: number;
    title: string;
    removed_at: string | null;
    period?: string | null;
  }[];
  contextualReturnTo: string;
}) {
  if (linkedTasks.length === 0) return null;
  return (
    <section
      aria-label="Linked Tasks"
      className="space-y-3 rounded-lg border border-border bg-surface p-4 [&>.section-heading:first-child]:mt-0"
    >
      <SectionHeading title={`Linked Tasks (${linkedTasks.length})`} />
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface-muted/30 px-4 text-sm">
        {linkedTasks.map((linkedTask) => (
          <li
            key={linkedTask.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            {linkedTask.removed_at ? (
              <>
                <span className="text-muted">{linkedTask.title}</span>
                <span className="text-xs text-muted">Deleted</span>
              </>
            ) : (
              <Link
                href={withReturnTo(
                  `/tasks/${linkedTask.id}`,
                  contextualReturnTo,
                  linkedTask.period,
                )}
                className="font-medium text-foreground hover:text-brand hover:underline"
              >
                {linkedTask.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventPointHistorySection({
  eventId,
  transactions,
  period,
}: {
  eventId: number;
  transactions: ComponentProps<typeof PointTransactionTable>["transactions"];
  period?: string;
}) {
  if (transactions.length === 0) return null;
  return (
    <section
      aria-label="Event point history"
      className="space-y-3 rounded-lg border border-border bg-surface p-4 [&>.section-heading:first-child]:mt-0"
    >
      <SectionHeading
        title={`Event point history (${transactions.length})`}
        action={
          <Link
            href={
              `/points?${new URLSearchParams({ view: "history", event: String(eventId), ...(period ? { period } : {}) })}` as Route
            }
            className="text-xs font-medium text-brand hover:underline"
          >
            View in Points history
          </Link>
        }
      />
      <TableFrame compact label="Event point history">
        <PointTransactionTable transactions={transactions} period={period} />
      </TableFrame>
    </section>
  );
}
