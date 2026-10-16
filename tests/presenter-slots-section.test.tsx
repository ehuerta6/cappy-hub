import { beforeEach, expect, it, vi } from "vitest";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: vi.fn(),
}));
vi.mock("@/app/(protected)/events/presenter-slot-actions", () => ({
  addPresenterSlot: vi.fn(),
  changePresenterSlot: vi.fn(),
  removePresenterSlot: vi.fn(),
  reorderPresenterSlots: vi.fn(),
  updatePresenterSlotDetails: vi.fn(),
}));

import PresenterSlotsSection, {
  type PresenterSlot,
} from "@/app/(protected)/events/presenter-slots-section";
import {
  isSessionEventType,
  presenterSlotsClosedReason,
} from "@/lib/event-status";

const slot = (overrides: Partial<PresenterSlot>): PresenterSlot => ({
  id: 1,
  position: 1,
  officer_id: null,
  presentation_title: null,
  difficulty: null,
  resource_url: null,
  prep_notes: null,
  officers: null,
  ...overrides,
});
const slots = [
  slot({
    id: 11,
    position: 1,
    officer_id: 8,
    officers: { id: 8, name: "Avery Chen" },
    presentation_title: "Two Sum",
    difficulty: "Medium",
    resource_url: "https://example.org/two-sum",
  }),
  slot({ id: 12, position: 2, difficulty: "Medium" }),
  slot({
    id: 13,
    position: 3,
    officer_id: 8,
    officers: { id: 8, name: "Avery Chen" },
    presentation_title: "Interview tips",
  }),
];
const render = (props: Partial<Parameters<typeof PresenterSlotsSection>[0]>) =>
  renderToStaticMarkup(
    createElement(PresenterSlotsSection, {
      eventId: 7,
      slots,
      actorId: 1,
      canManage: false,
      canVolunteer: true,
      volunteerBlockedReason: null,
      closedReason: null,
      officers: [{ id: 9, name: "Riley Garcia" }],
      ...props,
    }),
  );

beforeEach(() => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
});

it("lists slots in stable order with repeated difficulty and repeated presenters", () => {
  const html = render({});
  expect(html).toContain("Presenters (3)");
  expect(html).toContain("1 of 3 slots open");
  expect(html.indexOf("Slot 1")).toBeLessThan(html.indexOf("Slot 2"));
  expect(html.indexOf("Slot 2")).toBeLessThan(html.indexOf("Slot 3"));
  expect(html.match(/Avery Chen/g)).toHaveLength(2);
  expect(html.match(/>Medium</g)).toHaveLength(2);
  expect(html).toContain("Interview tips");
  expect(html).toContain('href="https://example.org/two-sum"');
});

it("renders a fourth slot with arbitrary difficulty and no required difficulty", () => {
  const html = render({
    slots: [
      ...slots,
      slot({
        id: 14,
        position: 4,
        presentation_title: "Interview strategy talk",
        difficulty: "Nightmare",
      }),
    ],
  });

  expect(html).toContain("Presenters (4)");
  expect(html).toContain("2 of 4 slots open");
  expect(html).toContain("Nightmare");
  expect(html.indexOf("Slot 3")).toBeLessThan(html.indexOf("Slot 4"));
  const slotWithoutDifficulty = html.slice(
    html.indexOf("Slot 3"),
    html.indexOf("Slot 4"),
  );
  expect(slotWithoutDifficulty).toContain("Interview tips");
  expect(slotWithoutDifficulty).not.toContain("Medium");
  expect(slotWithoutDifficulty).not.toContain("Nightmare");
});

it("offers an Officer Volunteer on open slots and no management controls", () => {
  const html = render({});
  expect(html).toContain('aria-label="Volunteer for slot 2"');
  expect(html).not.toContain("Volunteer for slot 1");
  expect(html).not.toContain("Remove presenter");
  expect(html).not.toContain("Move up");
  expect(html).not.toContain("Assign presenter");
  expect(html).not.toContain("Edit details");
  expect(html).not.toContain("Add presenter slot");
});

it("lets a presenter step down from each of their own slots", () => {
  const html = render({ actorId: 8 });
  expect(html).toContain('aria-label="Step down from slot 1"');
  expect(html).toContain('aria-label="Step down from slot 3"');
  expect(html.match(/Edit details/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Volunteer for slot 2"');
});

it("offers optional editing immediately after an Officer claims a slot", () => {
  const html = render({
    actorId: 9,
    slots: [
      slots[0],
      slot({
        id: 12,
        position: 2,
        officer_id: 9,
        officers: { id: 9, name: "Riley Garcia" },
      }),
      slots[2],
    ],
  });

  expect(html).toContain('aria-label="Step down from slot 2"');
  expect(html).toContain("Edit details");
  expect(html).not.toContain("Add presenter slot");
  expect(html).not.toContain("Assign presenter");
});

it("gives managers add, reorder, assign, remove and detail controls", () => {
  const html = render({ canManage: true });
  expect(html).toContain("Add presenter slot");
  expect(html).toContain('aria-label="Remove Avery Chen from slot 1"');
  expect(html).not.toContain("Move slot 1 up");
  expect(html).toContain('aria-label="Move slot 1 down"');
  expect(html).toContain('aria-label="Move slot 3 up"');
  expect(html).not.toContain("Move slot 3 down");
  expect(html).toContain('aria-label="Remove empty slot 2"');
  expect(html).not.toContain("Remove empty slot 1");
  expect(html).toContain("Assign presenter to slot 2");
  expect(html).toContain("Riley Garcia");
  expect(html.match(/Edit details/g)).toHaveLength(3);
  for (const difficulty of ["Easy", "Medium", "Hard"])
    expect(html).toContain(`<option value="${difficulty}">`);
});

it("hides every action and explains why when slots are closed", () => {
  const html = render({
    canManage: true,
    actorId: 8,
    closedReason: "This Event has started.",
  });
  expect(html).toContain("Presenter slots are closed. This Event has started.");
  for (const control of [
    "Volunteer for slot",
    "Volunteering also signs you up",
    "Step down",
    "Remove presenter",
    "Move slot",
    "Assign presenter",
    "Edit details",
    "Add presenter slot",
  ])
    expect(html).not.toContain(control);
  expect(html).toContain("Two Sum");
});

it("explains why an Officer cannot volunteer for a full Session", () => {
  const html = render({
    volunteerBlockedReason:
      "This Session is full, so only confirmed officers can volunteer.",
  });
  expect(html).toContain("only confirmed officers can volunteer");
  expect(html).not.toContain("Volunteer for slot 2");
});

it("shows an empty state with Add for managers when no slots exist", () => {
  expect(render({ slots: [] })).toContain("No presenter slots yet.");
  expect(render({ slots: [], canManage: true })).toContain(
    "Add presenter slot",
  );
});

it("identifies Session Events and when presenter slots close", () => {
  expect(isSessionEventType(" Session ")).toBe(true);
  expect(isSessionEventType("Workshop")).toBe(false);
  const event = {
    status: "upcoming",
    event_date: "2026-10-20",
    starts_at: "2026-10-20T23:00:00Z",
    ends_at: "2026-10-21T01:00:00Z",
    deleted_at: null,
    participation_points_per_hour_at_end: null,
  };
  const beforeStart = Date.parse("2026-10-20T22:00:00Z");
  const duringEvent = Date.parse("2026-10-20T23:30:00Z");
  expect(presenterSlotsClosedReason(event, beforeStart)).toBeNull();
  expect(presenterSlotsClosedReason(event, duringEvent)).toBe(
    "This Event has started.",
  );
  expect(
    presenterSlotsClosedReason({ ...event, status: "cancelled" }, beforeStart),
  ).toBe("This Event is cancelled.");
  expect(
    presenterSlotsClosedReason(
      { ...event, deleted_at: "2026-10-19T00:00:00Z" },
      beforeStart,
    ),
  ).toBe("This Event is archived.");
  expect(
    presenterSlotsClosedReason(
      { ...event, participation_points_per_hour_at_end: 5 },
      beforeStart,
    ),
  ).toBe("This Event has been processed.");
});
