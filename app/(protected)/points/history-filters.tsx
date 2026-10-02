"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatEventFilterOption } from "@/lib/presentation";
import { pointHistoryUrl, type PointHistoryFilterKey } from "./history-url";

type PointHistoryFilterControlsProps = {
  officers: { id: number; name: string }[];
  events: { id: number; name: string; event_date: string }[];
  isAdmin: boolean;
  status: string;
  fromDate: string;
  toDate: string;
  searchQuery: string;
};

export default function PointHistoryFilterControls({
  officers,
  events,
  isAdmin,
  status,
  fromDate,
  toDate,
  searchQuery,
}: PointHistoryFilterControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draftSearchQuery, setDraftSearchQuery] = useState(searchQuery);

  const navigateWithFilter = (
    filterKey: PointHistoryFilterKey,
    filterValue: string,
  ) => {
    const nextUrl = pointHistoryUrl(pathname, searchParams.toString(), {
      [filterKey]: filterValue,
    });
    startTransition(() => router.push(nextUrl, { scroll: false }));
  };

  const applySearch = (formData: FormData) => {
    const query = String(formData.get("q") ?? "")
      .trim()
      .slice(0, 100);
    const nextUrl = pointHistoryUrl(pathname, searchParams.toString(), {
      q: query,
    });
    startTransition(() => router.push(nextUrl, { scroll: false }));
  };

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        applySearch(new FormData(event.currentTarget));
      }}
    >
      <label className="min-w-48 flex-1">
        Search officer, reason, event, or task
        <input
          name="q"
          type="search"
          value={draftSearchQuery}
          onChange={(event) => setDraftSearchQuery(event.target.value)}
        />
      </label>
      <label>
        Type
        <select
          name="type"
          value={searchParams.get("type") ?? ""}
          onChange={(event) => navigateWithFilter("type", event.target.value)}
        >
          <option value="">All types</option>
          <option value="participation">Participation</option>
          <option value="task">Task</option>
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
        </select>
      </label>
      <label>
        Officer
        <select
          name="officer"
          value={searchParams.get("officer") ?? ""}
          onChange={(event) =>
            navigateWithFilter("officer", event.target.value)
          }
        >
          <option value="">All officers</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-52 flex-1">
        Event
        <select
          name="event"
          value={searchParams.get("event") ?? ""}
          onChange={(event) => navigateWithFilter("event", event.target.value)}
        >
          <option value="">All events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {formatEventFilterOption(event.name, event.event_date)}
            </option>
          ))}
        </select>
      </label>
      {isAdmin && (
        <label>
          Status
          <select
            name="status"
            value={status}
            onChange={(event) =>
              navigateWithFilter("status", event.target.value)
            }
          >
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
      )}
      <label>
        From
        <input
          aria-label="From activity date"
          name="from"
          type="date"
          value={fromDate}
          onChange={(event) => navigateWithFilter("from", event.target.value)}
        />
      </label>
      <label>
        To
        <input
          aria-label="To activity date"
          name="to"
          type="date"
          value={toDate}
          onChange={(event) => navigateWithFilter("to", event.target.value)}
        />
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? "Filtering…" : "Apply filters"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => router.push(pathname))}
      >
        Clear filters
      </button>
      <span className="sr-only" aria-live="polite">
        {isPending ? "Filtering point history" : ""}
      </span>
    </form>
  );
}
