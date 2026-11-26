"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { emitToast } from "@/components/toast-region";

export type RosterRowItem = {
  id: number;
  participationType: "volunteer" | "attendee";
  email: string | null;
  row: ReactNode;
};

export default function EventRosterTableClient({
  rows,
  showTimeSlots,
  canCopyEmails,
}: {
  rows: RosterRowItem[];
  showTimeSlots: boolean;
  canCopyEmails: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "volunteer" | "attendee">("all");
  const [copied, setCopied] = useState(false);

  const volunteerCount = rows.filter(
    (r) => r.participationType === "volunteer",
  ).length;
  const attendeeCount = rows.length - volunteerCount;
  const filteredRows =
    filter === "all"
      ? rows
      : rows.filter((r) => r.participationType === filter);

  const emails = [
    ...new Set(
      filteredRows
        .map((r) => r.email?.trim())
        .filter((email): email is string => Boolean(email)),
    ),
  ];

  async function copyEmails() {
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
      emitToast(
        `Copied ${emails.length} email${emails.length === 1 ? "" : "s"}`,
      );
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      emitToast("Could not copy emails", "error");
    }
  }

  return (
    <div className="space-y-3">
      {(rows.length > 1 || (canCopyEmails && emails.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rows.length > 1 ? (
            <div
              role="group"
              aria-label="Filter roster by participation type"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: "all", label: `All (${rows.length})` },
                  { id: "volunteer", label: `Volunteers (${volunteerCount})` },
                  { id: "attendee", label: `Attendees (${attendeeCount})` },
                ] as const
              ).map((option) => {
                const active = filter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(option.id)}
                    className={`!min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-brand-border bg-brand-bg text-brand"
                        : "border-border bg-surface-muted text-secondary hover:border-border-strong hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div />
          )}
          {canCopyEmails && emails.length > 0 && (
            <button
              type="button"
              onClick={() => void copyEmails()}
              className="button-secondary inline-flex !min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
            >
              {copied ? (
                <Check aria-hidden="true" size={13} className="text-success" />
              ) : (
                <Copy aria-hidden="true" size={13} />
              )}
              <span>
                {copied
                  ? "Copied"
                  : `Copy ${filter === "all" ? "roster" : filter} emails (${emails.length})`}
              </span>
            </button>
          )}
        </div>
      )}
      {filteredRows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-muted">
          No {filter === "volunteer" ? "Volunteers" : "Attendees"} signed up.
        </p>
      ) : (
        <div
          className="table-frame table-frame--compact table-frame--keyboard-scroll overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label="Event signups"
          tabIndex={0}
        >
          <table className="min-w-full">
            <thead>
              <tr>
                <th scope="col">Officer</th>
                {showTimeSlots && <th scope="col">Time Slots</th>}
                <th scope="col">Signup</th>
              </tr>
            </thead>
            <tbody>{filteredRows.map((item) => item.row)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
