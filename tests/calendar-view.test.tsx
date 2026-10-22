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
  entries: [] as unknown[],
  loading: true,
  loadError: false,
  latestRequest: { current: 0 },
  latestRange: { current: null as string | null },
  loadVisibleRange: undefined as unknown,
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
      : Array.isArray(initial)
        ? [harness.entries, (next: unknown[]) => (harness.entries = next)]
        : initial === true
          ? [harness.loading, (next: boolean) => (harness.loading = next)]
          : [harness.loadError, (next: boolean) => (harness.loadError = next)],
  useRef: (initial: unknown) =>
    initial === 0 ? harness.latestRequest : harness.latestRange,
  useCallback: (callback: unknown) => {
    harness.loadVisibleRange ??= callback;
    return harness.loadVisibleRange;
  },
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
  harness.entries = [];
  harness.loading = true;
  harness.loadError = false;
  harness.latestRequest.current = 0;
  harness.latestRange.current = null;
  harness.loadVisibleRange = undefined;
  vi.clearAllMocks();
  harness.fetchRange.mockResolvedValue(entries);
  vi.unstubAllGlobals();
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
  });
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

it("loads each visible range once and filters loaded entries without refetching", async () => {
  harness.entries = entries;
  const tree = CalendarView();
  // Exercise the actual checkbox callback, then render with the updated hook state.
  const labels = tree.props.children[0].props.children[0].props.children[1];
  labels[1].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView />);
  expect(harness.options.events).toEqual([entries[0]]);
  const datesSet = harness.options.datesSet as (info: {
    start: Date;
    end: Date;
  }) => void;
  const octoberRange = {
    start: new Date("2026-10-01T06:00:00.000Z"),
    end: new Date("2026-11-01T06:00:00.000Z"),
  };
  datesSet(octoberRange);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(harness.fetchRange).toHaveBeenCalledWith(
    "2026-10-01T06:00:00.000Z",
    "2026-11-01T06:00:00.000Z",
  );
  datesSet(octoberRange);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(harness.fetchRange).toHaveBeenCalledTimes(1);
  labels[1].props.children[0].props.onChange({ target: { checked: true } });
  labels[0].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView />);
  expect(harness.options.events).toEqual([entries[1]]);
  expect(harness.fetchRange).toHaveBeenCalledTimes(1);
  expect(entries).toHaveLength(2);
});

it("ignores a late response from a range that is no longer visible", async () => {
  let resolveOctober!: (value: typeof entries) => void;
  let resolveNovember!: (value: typeof entries) => void;
  harness.fetchRange
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveOctober = resolve)),
    )
    .mockImplementationOnce(
      () => new Promise((resolve) => (resolveNovember = resolve)),
    );
  renderToStaticMarkup(<CalendarView />);
  const datesSet = harness.options.datesSet as (info: {
    start: Date;
    end: Date;
  }) => void;
  datesSet({
    start: new Date("2026-10-01T06:00:00.000Z"),
    end: new Date("2026-11-01T06:00:00.000Z"),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  datesSet({
    start: new Date("2026-11-01T06:00:00.000Z"),
    end: new Date("2026-12-01T07:00:00.000Z"),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  resolveNovember([entries[1]]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(harness.entries).toEqual([entries[1]]);
  resolveOctober([entries[0]]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(harness.entries).toEqual([entries[1]]);
  expect(harness.loading).toBe(false);
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
  harness.entries = entries;
  harness.loading = false;
  renderToStaticMarkup(<CalendarView />);
  harness.visible = { event: false, task: false };
  const html = renderToStaticMarkup(<CalendarView />);
  expect(html).toContain("Choose Events or Tasks to show entries.");
  expect(harness.options.events).toEqual([]);
});
