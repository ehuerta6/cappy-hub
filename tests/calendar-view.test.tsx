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
  effects: [] as Array<() => (() => void) | void>,
  api: { view: { type: "listMonth" }, changeView: vi.fn() },
  push: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: () => ({ current: { getApi: () => harness.api } }),
  useEffect: (effect: () => (() => void) | void) =>
    harness.effects.push(effect),
  useState: () => [
    harness.visible,
    (update: (current: typeof harness.visible) => typeof harness.visible) => {
      harness.visible = update(harness.visible);
    },
  ],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/components/theme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@fullcalendar/react", () => ({
  default: (options: CalendarOptions) => {
    harness.options = options;
    return null;
  },
}));
vi.mock("@fullcalendar/react/daygrid", () => ({
  default: { name: "daygrid" },
}));
vi.mock("@fullcalendar/react/list", () => ({ default: { name: "list" } }));
vi.mock("@fullcalendar/react/themes/classic", () => ({
  default: { name: "classic" },
}));

import CalendarView, {
  COMPACT_CALENDAR_QUERY,
} from "@/app/(protected)/calendar/calendar-view";

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
  harness.effects = [];
  harness.api.view.type = "listMonth";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("uses the installed list plugin, Denver time, and a read-only month with reachable overflow", () => {
  const html = renderToStaticMarkup(<CalendarView entries={entries} />);
  expect(html).toContain("Show Calendar entries");
  expect(html.match(/checked=""/g)).toHaveLength(2);
  expect(harness.options.plugins).toContainEqual({ name: "list" });
  expect(harness.options.timeZone).toBe("America/Denver");
  expect(harness.options.editable).toBe(false);
  expect(harness.options.selectable).toBe(false);
  expect(harness.options.initialView).toBe("listMonth");
  expect(harness.options.fixedWeekCount).toBe(false);
  expect(harness.options.dayMaxEvents).toBe(3);
  expect(harness.options.popoverClass).toBe("calendar-shell calendar-popover");
  expect(harness.options.moreLinkClick).toBe("popover");
  expect(harness.options.noEventsText).toContain("No entries this month");
  expect(harness.options.colorScheme).toBe("light");
});

it("switches at the compact breakpoint without remounting or resetting the date", () => {
  renderToStaticMarkup(<CalendarView entries={entries} />);
  const media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("window", { matchMedia });
  const cleanup = harness.effects[0]();
  expect(matchMedia).toHaveBeenCalledWith(COMPACT_CALENDAR_QUERY);
  expect(harness.api.changeView).toHaveBeenCalledWith("dayGridMonth");
  harness.api.view.type = "dayGridMonth";
  media.matches = true;
  const onChange = media.addEventListener.mock.calls[0][1];
  onChange();
  expect(harness.api.changeView).toHaveBeenLastCalledWith("listMonth");
  harness.api.view.type = "listMonth";
  harness.api.changeView.mockClear();
  onChange();
  expect(harness.api.changeView).not.toHaveBeenCalled();
  cleanup?.();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", onChange);
});

it("the checkbox callbacks update transient state and display the selected entries", () => {
  const tree = CalendarView({ entries });
  // Exercise the actual checkbox callback, then render with the updated hook state.
  const labels = tree.props.children[0].props.children[0].props.children[1];
  labels[1].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView entries={entries} />);
  expect(harness.options.events).toEqual([entries[0]]);
  labels[1].props.children[0].props.onChange({ target: { checked: true } });
  labels[0].props.children[0].props.onChange({ target: { checked: false } });
  renderToStaticMarkup(<CalendarView entries={entries} />);
  expect(harness.options.events).toEqual([entries[1]]);
  expect(entries).toHaveLength(2);
});

it("renders type and time text and gives entry links an accessible full description", () => {
  renderToStaticMarkup(<CalendarView entries={entries} />);
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
  renderToStaticMarkup(<CalendarView entries={entries} />);
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

it("explains empty data and disabled presentation filters", () => {
  expect(renderToStaticMarkup(<CalendarView entries={[]} />)).toContain(
    "No Events or Task due dates yet.",
  );
  harness.visible = { event: false, task: false };
  expect(renderToStaticMarkup(<CalendarView entries={entries} />)).toContain(
    "Choose Events or Tasks to show entries.",
  );
  expect(harness.options.events).toEqual([]);
});
