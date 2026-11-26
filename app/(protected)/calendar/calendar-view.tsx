"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTheme } from "@/components/theme";
import { filterCalendarEntries, type CalendarEntry } from "./calendar-events";
import { fetchCalendarRange } from "./calendar-actions";

function calendarRoute(
  url: string,
  kind: unknown,
  origin = "https://cappyhub.local",
): Route<`/events/${string}` | `/tasks/${string}`> | undefined {
  let destination: URL;
  try {
    destination = new URL(url, origin);
  } catch {
    return undefined;
  }
  if (destination.origin !== origin || destination.search || destination.hash)
    return undefined;
  if (kind === "event" && /^\/events\/-?[1-9]\d*$/.test(destination.pathname))
    return destination.pathname as Route<`/events/${string}`>;
  if (kind === "task" && /^\/tasks\/-?[1-9]\d*$/.test(destination.pathname))
    return destination.pathname as Route<`/tasks/${string}`>;
  return undefined;
}

export default function CalendarView({
  periodId = null,
  periodQuery,
  initialDate,
  initialEntries,
  scope,
}: {
  periodId?: number | null;
  periodQuery?: string;
  initialDate?: string;
  initialEntries?: CalendarEntry[];
  scope?: "all" | "mine" | "branch";
} = {}) {
  const router = useRouter();
  const { theme } = useTheme();
  const [visible, setVisible] = useState({ event: true, task: true });
  const [entries, setEntries] = useState<CalendarEntry[]>(initialEntries ?? []);
  const [loading, setLoading] = useState(initialEntries === undefined);
  const [loadError, setLoadError] = useState(false);
  const latestRequest = useRef(0);
  const latestRange = useRef<string | null>(null);
  const displayedEntries = filterCalendarEntries(entries, visible);

  const loadVisibleRange = useCallback(
    (info: { start: Date; end: Date }) => {
      const start = info.start.toISOString();
      const end = info.end.toISOString();
      const rangeKey = `${start}/${end}`;
      if (rangeKey === latestRange.current) return;
      const isInitialHydration =
        latestRange.current === null && initialEntries !== undefined;
      latestRange.current = rangeKey;
      const requestId = ++latestRequest.current;

      // FullCalendar may report a new range during its render lifecycle.
      // Defer the action and React updates until after that lifecycle completes.
      window.setTimeout(() => {
        if (requestId !== latestRequest.current) return;
        if (!isInitialHydration) setLoading(true);
        setLoadError(false);
        void (
          scope && scope !== "all"
            ? fetchCalendarRange(start, end, periodId, scope)
            : fetchCalendarRange(start, end, periodId)
        )
          .then((nextEntries) => {
            if (requestId === latestRequest.current) setEntries(nextEntries);
          })
          .catch(() => {
            if (requestId === latestRequest.current) {
              latestRange.current = null;
              if (!isInitialHydration) {
                setEntries([]);
                setLoadError(true);
              }
            }
          })
          .finally(() => {
            if (requestId === latestRequest.current) setLoading(false);
          });
      }, 0);
    },
    [initialEntries, periodId, scope],
  );

  const visibleEventCount = displayedEntries.filter(
    (entry) => entry.extendedProps.kind === "event",
  ).length;
  const visibleTaskCount = displayedEntries.length - visibleEventCount;

  return (
    <div className="calendar-shell min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <fieldset className="calendar-filters">
          <legend className="sr-only">Show Calendar entries</legend>
          {(["event", "task"] as const).map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={visible[kind]}
                onChange={(event) =>
                  setVisible((current) => ({
                    ...current,
                    [kind]: event.target.checked,
                  }))
                }
              />
              {kind === "event" ? "Events" : "Tasks"}
            </label>
          ))}
        </fieldset>
        <p className="text-xs tabular-nums text-muted">
          {!loading && !loadError && entries.length > 0
            ? `${visibleEventCount} event${visibleEventCount === 1 ? "" : "s"} · ${visibleTaskCount} task${visibleTaskCount === 1 ? "" : "s"} · `
            : ""}
          America/Denver
        </p>
      </div>
      {loading && (
        <p className="calendar-empty" role="status">
          Loading Calendar entries.
        </p>
      )}
      {loadError && (
        <div
          className="feedback-message feedback-error mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"
          role="alert"
        >
          <span>
            Could not load Calendar entries. Try another month or refresh the
            page.
          </span>
          <button
            type="button"
            className="button-secondary"
            onClick={() => router.refresh()}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !loadError && displayedEntries.length === 0 && (
        <p className="calendar-empty" role="status">
          {entries.length === 0
            ? "No Events or Task due dates yet."
            : !visible.event && !visible.task
              ? "Choose Events or Tasks to show entries."
              : "No entries of the selected type."}
        </p>
      )}
      <div
        className={
          loading || loadError ? "calendar-grid-unavailable" : undefined
        }
      >
        <FullCalendar
          plugins={[classicThemePlugin, dayGridPlugin]}
          initialView="dayGridMonth"
          initialDate={initialDate}
          timeZone="America/Denver"
          colorScheme={theme}
          editable={false}
          selectable={false}
          eventDisplay="block"
          fixedWeekCount={false}
          dayMaxEvents={3}
          moreLinkClick="popover"
          moreLinkText={(count) => `+${count} more`}
          moreLinkHint={(count) => `Show ${count} more Calendar entries`}
          moreLinkClass="calendar-more"
          popoverClass="calendar-shell calendar-popover"
          popoverFormat={{ weekday: "long", month: "long", day: "numeric" }}
          datesSet={loadVisibleRange}
          events={displayedEntries}
          eventTimeFormat={{
            hour: "numeric",
            minute: "2-digit",
            meridiem: "short",
          }}
          allDayText="Due"
          noEventsText="No entries this month. Try another month or adjust the filters."
          headerToolbar={{
            left: "title",
            center: "",
            right: "prev,next today",
          }}
          toolbarClass="calendar-toolbar"
          toolbarTitleClass="calendar-title"
          dayHeaderClass="calendar-weekday"
          dayCellClass={(info) => (info.isToday ? "calendar-today" : "")}
          dayCellInnerClass="calendar-day"
          dayCellTopClass="calendar-date"
          eventClass="calendar-entry"
          eventContent={(info) => (
            <div className="calendar-entry-content">
              <span className="calendar-entry-meta">
                <span className="calendar-entry-kind">
                  {info.event.extendedProps.kind === "event" ? "Event" : "Task"}
                </span>
                <span>{info.event.allDay ? "Due" : info.timeText}</span>
              </span>
              <span className="calendar-entry-title">{info.event.title}</span>
            </div>
          )}
          eventDidMount={(info) => {
            info.el.setAttribute(
              "aria-label",
              info.event.extendedProps.description,
            );
            info.el.setAttribute("role", "link");
          }}
          eventClick={(info) => {
            // FullCalendar exposes url as a plain string. Only our canonical
            // Event and Task detail URLs cross into Next navigation.
            const href = calendarRoute(
              info.event.url,
              info.event.extendedProps?.kind,
            );
            if (!href) return;
            info.jsEvent.preventDefault();
            const query = periodQuery
              ? `?period=${encodeURIComponent(periodQuery)}`
              : "";
            router.push(
              (query ? `${href}${query}` : href) as import("next").Route,
            );
          }}
        />
      </div>
    </div>
  );
}
