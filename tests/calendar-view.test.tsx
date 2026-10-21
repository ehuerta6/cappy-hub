import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarOptions } from "@fullcalendar/react";
import {
  mapEventOccurrences,
  mapTaskOccurrences,
} from "@/app/(protected)/calendar/calendar-events";

const harness = vi.hoisted(() => ({
  options: {} as CalendarOptions,
  visible: { event: true, task: true },
  push: vi.fn(),
  fetchRange: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) =>
    typeof initial === "object" && initial !== null && "event" in initial
      ? [
          harness.visible,
          (
            update: (current: typeof harness.visible) => typeof harness.visible,
          ) => {
            harness.visible = update(harness.visible);
          },
        ]
      : [initial, vi.fn()],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/components/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/app/(protected)/calendar/calendar-actions", () => ({
  fetchCalendarRange: harness.fetchRange,
}));
vi.mock("@fullcalendar/react", () => ({
  default: (options: CalendarOptions) => {
    harness.options = options;
    return null;
  },
}));
vi.mock("@fullcalendar/react/daygrid", () => ({
  default: { name: "daygrid" },
}));
vi.mock("@fullcalendar/react/themes/classic", () => ({
  default: { name: "classic" },
}));

import CalendarView from "@/app/(protected)/calendar/calendar-view";

const entries = [
  ...mapEventOccurrences([
    {
      id: 12,
      name: "Club meeting",
      starts_at: "2026-10-08T23:00:00Z",
      ends_at: "2026-10-09T01:00:00Z",
    },
  ]),
  ...mapTaskOccurrences([{ id: 9, title: "Slides", due_date: "2026-10-08" }]),
];

beforeEach(() => {
  harness.visible = { event: true, task: true };
  vi.clearAllMocks();
  harness.fetchRange.mockResolvedValue(entries);
  vi.unstubAllGlobals();
});

it("uses the desktop month view, Denver time, and a read-only calendar", () => {
  const html = renderToStaticMarkup(<CalendarView />);
  expect(html).toContain("Show Calendar entries");
  expect(html.match(/checked=""/g)).toHaveLength(2);
  expect(harness.options.plugins).toEqual([
    { name: "classic" },
    { name: "daygrid" },
  ]);
  expect(harness.options.timeZone).toBe("America/Denver");
  expect(harness.options.height).toBeUndefined();
  expect(harness.options.editable).toBe(false);
  expect(harness.options.selectable).toBe(false);
  expect(harness.options.initialView).toBe("dayGridMonth");
  expect(harness.options.fixedWeekCount).toBe(false);
  expect(harness.options.dayMaxEvents).toBe(3);
  expect(harness.options.popoverClass).toBe("calendar-shell calendar-popover");
  expect(harness.options.moreLinkClick).toBe("popover");
  expect(harness.options.noEventsText).toContain("No entries this month");
  expect(harness.options.colorScheme).toBe("light");
});

it("loads the visible range and applies the selected entry filters", async () => {
  const tree = CalendarView();
  // Exercise the actual checkbox callback, then render with the updated hook state.
  const labels = tree.props.children[0].props.children[0].props.children[1];
  labels[1].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView />);
  const eventSource = harness.options.events as (info: {
    start: Date;
    end: Date;
  }) => Promise<typeof entries>;
  expect(
    await eventSource({
      start: new Date("2026-10-01T06:00:00.000Z"),
      end: new Date("2026-11-01T06:00:00.000Z"),
    }),
  ).toEqual([entries[0]]);
  expect(harness.fetchRange).toHaveBeenCalledWith(
    "2026-10-01T06:00:00.000Z",
    "2026-11-01T06:00:00.000Z",
  );
  labels[1].props.children[0].props.onChange({ target: { checked: true } });
  labels[0].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView />);
  expect(
    await (
      harness.options.events as (info: {
        start: Date;
        end: Date;
      }) => Promise<typeof entries>
    )({ start: new Date(), end: new Date(Date.now() + 1000) }),
  ).toEqual([entries[1]]);
  expect(entries).toHaveLength(2);
});

it("renders type and time text and gives entry links an accessible full description", () => {
  renderToStaticMarkup(<CalendarView />);
  for (const entry of entries) {
    const info = { event: entry, timeText: "5pm" };
    const content = (
      harness.options.eventContent as (info: unknown) => React.ReactNode
    )(info);
    const html = renderToStaticMarkup(content);
    expect(html).toContain(
      entry.extendedProps.kind === "event" ? "Event" : "Task",
    );
    expect(html).toContain(entry.allDay ? "Due" : "5pm");
    const el = { setAttribute: vi.fn() };
    (harness.options.eventDidMount as (info: unknown) => void)({ ...info, el });
    expect(el.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      entry.extendedProps.description,
    );
    expect(el.setAttribute).toHaveBeenCalledWith("role", "link");
  }
});

it("routes Event and Task clicks to canonical details and leaves URL-less entries alone", () => {
  renderToStaticMarkup(<CalendarView />);
  const preventDefault = vi.fn();
  for (const event of entries)
    (harness.options.eventClick as (info: unknown) => void)({
      event,
      jsEvent: { preventDefault },
    });
  expect(harness.push.mock.calls).toEqual([["/events/12"], ["/tasks/9"]]);
  expect(preventDefault).toHaveBeenCalledTimes(2);
  (harness.options.eventClick as (info: unknown) => void)({
    event: {},
    jsEvent: { preventDefault },
  });
  expect(harness.push).toHaveBeenCalledTimes(2);
  for (const event of [
    { url: "https://example.com", extendedProps: { kind: "event" } },
    { url: "/events/12/edit", extendedProps: { kind: "event" } },
    { url: "/tasks/9", extendedProps: { kind: "event" } },
  ])
    (harness.options.eventClick as (info: unknown) => void)({
      event,
      jsEvent: { preventDefault },
    });
  expect(harness.push).toHaveBeenCalledTimes(2);
});

it("explains disabled presentation filters", () => {
  renderToStaticMarkup(<CalendarView />);
  harness.visible = { event: false, task: false };
  renderToStaticMarkup(<CalendarView />);
  expect(harness.options.events).toBeTypeOf("function");
});
