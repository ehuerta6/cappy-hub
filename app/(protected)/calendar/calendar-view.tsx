"use client";

import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useTheme } from "@/components/theme";
import { filterCalendarEntries, type CalendarEntry } from "./calendar-events";

export const COMPACT_CALENDAR_QUERY = "(max-width: 767px)";

function calendarRoute(
  url: string,
  kind: unknown,
): Route<`/events/${string}` | `/tasks/${string}`> | undefined {
  if (kind === "event" && /^\/events\/\d+$/.test(url))
    return url as Route<`/events/${string}`>;
  if (kind === "task" && /^\/tasks\/\d+$/.test(url))
    return url as Route<`/tasks/${string}`>;
  return undefined;
}

export default function CalendarView({
  entries,
}: {
  entries: CalendarEntry[];
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const calendar = useRef<CalendarRef>(null);
  const [visible, setVisible] = useState({ event: true, task: true });
  const displayedEntries = filterCalendarEntries(entries, visible);

  useEffect(() => {
    const compact = window.matchMedia(COMPACT_CALENDAR_QUERY);
    const updateView = () => {
      const api = calendar.current?.getApi();
      const view = compact.matches ? "listMonth" : "dayGridMonth";
      // Changing the view on the same calendar keeps the browsed month intact.
      if (api && api.view.type !== view) api.changeView(view);
    };
    updateView();
    compact.addEventListener("change", updateView);
    return () => compact.removeEventListener("change", updateView);
  }, []);

  return (
    <div className="calendar-shell min-w-0 rounded-md border border-border bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
        <p className="text-xs">Event times · America/Denver</p>
      </div>
      {displayedEntries.length === 0 && (
        <p className="calendar-empty" role="status">
          {entries.length === 0
            ? "No Events or Task due dates yet."
            : !visible.event && !visible.task
              ? "Choose Events or Tasks to show entries."
              : "No entries of the selected type."}
        </p>
      )}
      <FullCalendar
        ref={calendar}
        plugins={[classicThemePlugin, dayGridPlugin, listPlugin]}
        initialView="listMonth"
        timeZone="America/Denver"
        colorScheme={theme}
        height="auto"
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
        events={displayedEntries}
        eventTimeFormat={{
          hour: "numeric",
          minute: "2-digit",
          meridiem: "short",
        }}
        allDayText="Due"
        listDayFormat={{ month: "short", day: "numeric" }}
        listDayAltFormat={{ weekday: "long" }}
        noEventsText="No entries this month. Try another month or adjust the filters."
        headerToolbar={{ left: "title", center: "", right: "prev,next today" }}
        toolbarClass="calendar-toolbar"
        toolbarTitleClass="calendar-title"
        dayHeaderClass="calendar-weekday"
        dayCellClass={(info) => (info.isToday ? "calendar-today" : "")}
        dayCellInnerClass="calendar-day"
        dayCellTopClass="calendar-date"
        listDayHeaderClass="calendar-list-date"
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
          // List view assigns listitem roles to anchors; keep navigation discoverable.
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
          router.push(href);
        }}
      />
    </div>
  );
}
