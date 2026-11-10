import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const actionState = vi.hoisted(() => ({
  current: { error: "", success: "" } as {
    error: string;
    success: string;
    fieldErrors?: Record<string, string>;
    values?: Record<string, string | string[]>;
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: () => [actionState.current, vi.fn(), false],
  };
});
vi.mock("@/app/(protected)/events/time-slot-actions", () => ({
  changeTimeSlotSignup: vi.fn(),
  assignBulkOfficersToTimeSlots: vi.fn(),
  correctHistoricalTimeSlotAssignments: vi.fn(),
}));

import TimeSlotsSection, {
  type EventTimeSlotWithRoster,
  isSelfTimeSlotSignup,
} from "@/app/(protected)/events/time-slots-section";
import {
  BulkAssignOfficersToSlotsForm,
  CorrectHistoricalTimeSlotAssignmentsForm,
  JoinSelectedTimeSlotsForm,
} from "@/app/(protected)/events/time-slot-controls";
import { overlappingSlotPairs, slotIsFull } from "@/lib/time-slot-conflicts";

const actorId = 7;
const slots: EventTimeSlotWithRoster[] = [
  {
    id: 101,
    starts_at: "2026-10-22T15:00:00.000Z",
    ends_at: "2026-10-22T15:30:00.000Z",
    capacity: 1,
    event_time_slot_officers: [
      { officer_id: 8, officers: { id: 8, name: "Full Officer" } },
    ],
  },
  {
    id: 102,
    starts_at: "2026-10-22T15:30:00.000Z",
    ends_at: "2026-10-22T16:00:00.000Z",
    capacity: null,
    event_time_slot_officers: [],
  },
  {
    id: 103,
    starts_at: "2026-10-22T16:00:00.000Z",
    ends_at: "2026-10-22T16:30:00.000Z",
    capacity: null,
    event_time_slot_officers: [],
  },
];

function renderSection(
  sectionSlots = slots,
  canCorrectAssignments = false,
  officers: { id: number; name: string }[] = [],
) {
  return renderToStaticMarkup(
    <TimeSlotsSection
      eventId={12}
      slots={sectionSlots}
      actorId={actorId}
      canCorrectAssignments={canCorrectAssignments}
      signupOpen
      confirmed
      activeOfficer
      eventCapacityBlocked={false}
      officers={officers}
      past={false}
    />,
  );
}

it("keeps original labels and IDs when the first full slot is filtered", () => {
  const html = renderSection();

  expect(html).toContain('value="102"');
  expect(html).toContain("Slot 2: 09:30–10:00");
  expect(html).toContain('value="103"');
  expect(html).toContain("Slot 3: 10:00–10:30");
  expect(html).not.toContain('type="checkbox" name="slot_ids" value="101"');
});

it("does not count preserved slot links for a removed signup as current occupancy", () => {
  const html = renderSection([
    {
      ...slots[0],
      event_time_slot_officers: [
        {
          officer_id: 8,
          officers: { id: 8, name: "Removed Officer" },
          event_officers: { removed_at: "2026-10-30T12:00:00Z" },
        },
      ],
    },
  ]);

  expect(html).toContain("0 / 1 registered");
  expect(html).toContain('type="checkbox" name="slot_ids" value="101"');
  expect(html).not.toContain("Removed Officer");
});

it("keeps original labels when an earlier slot is already selected", () => {
  const joinedSlots = [
    {
      ...slots[0],
      capacity: null,
      event_time_slot_officers: [
        {
          officer_id: actorId,
          officers: { id: actorId, name: "Current Officer" },
        },
      ],
    },
    ...slots.slice(1),
  ];

  const html = renderSection(joinedSlots);
  expect(html).toContain('type="checkbox" name="slot_ids" value="102"');
  expect(html).toContain("Slot 2: 09:30–10:00");
  expect(html).toContain('type="checkbox" name="slot_ids" value="103"');
  expect(html).toContain("Slot 3: 10:00–10:30");
});

it("explains overlapping choices and blocks self-signup while keeping the checklist keyboard-usable", () => {
  actionState.current = {
    error: "An Officer cannot be assigned to overlapping Time Slots",
    success: "",
    values: { slot_ids: ["101", "102"] },
  };
  const html = renderToStaticMarkup(
    <JoinSelectedTimeSlotsForm
      eventId={12}
      slots={[
        {
          id: 101,
          starts_at: "2026-10-22T15:00:00.000Z",
          ends_at: "2026-10-22T15:45:00.000Z",
          position: 1,
        },
        {
          id: 102,
          starts_at: "2026-10-22T15:30:00.000Z",
          ends_at: "2026-10-22T16:00:00.000Z",
          position: 2,
        },
      ]}
    />,
  );

  expect(html).toContain('name="slot_ids"');
  expect(html).toContain("Slots 1 and 2 overlap");
  expect(html).toContain('role="alert"');
  expect(html).toContain('disabled=""');
});

it("blocks a manager bulk assignment with overlapping slots and retains the selected Officer and slots", () => {
  actionState.current = {
    error: "An Officer cannot be assigned to overlapping Time Slots",
    success: "",
    values: { officer_ids: ["8"], slot_ids: ["101", "102"] },
  };
  const html = renderToStaticMarkup(
    <BulkAssignOfficersToSlotsForm
      eventId={12}
      officers={[{ id: 8, name: "Selected Officer" }]}
      slots={[
        {
          id: 101,
          starts_at: "2026-10-22T15:00:00.000Z",
          ends_at: "2026-10-22T15:45:00.000Z",
          capacity: 1,
          registeredCount: 1,
        },
        {
          id: 102,
          starts_at: "2026-10-22T15:30:00.000Z",
          ends_at: "2026-10-22T16:00:00.000Z",
          capacity: null,
          registeredCount: 0,
        },
      ]}
    />,
  );

  expect(html).toContain("Selected Officer");
  expect(html).toContain("Slots 1 and 2 overlap");
  expect(html).toContain("Full — unavailable");
  expect(html).toContain("Full — unavailable; selected for assignment");
  expect(html).toContain("Selected for assignment");
  expect(html).toContain(
    "Each selected Officer would receive every selected slot",
  );
  expect(html).toContain('checked="" value="101"');
  expect(html).toContain('checked="" value="102"');
  expect(html).toContain('disabled=""');
});

it("identifies a manager assignment candidate whose existing slot overlaps", () => {
  actionState.current = { error: "", success: "" };
  const html = renderSection(
    [
      {
        ...slots[0],
        starts_at: "2026-10-22T15:00:00.000Z",
        ends_at: "2026-10-22T15:45:00.000Z",
        capacity: null,
        event_time_slot_officers: [
          {
            officer_id: actorId,
            is_self_signup: true,
            officers: { id: actorId, name: "Current Officer" },
          },
        ],
      },
      {
        ...slots[1],
        starts_at: "2026-10-22T15:30:00.000Z",
        ends_at: "2026-10-22T16:00:00.000Z",
        capacity: null,
        event_time_slot_officers: [],
      },
    ],
    true,
    [{ id: actorId, name: "Current Officer" }],
  );

  expect(html).toContain("Current Officer — conflicts with Slot 1");
  expect(html).toContain("Open — available");
  expect(html).toContain("Self signed up");
});

it("labels a manager-added slot separately from a self signup", () => {
  const html = renderSection([
    {
      ...slots[1],
      event_time_slot_officers: [
        {
          officer_id: actorId,
          is_self_signup: false,
          officers: { id: actorId, name: "Current Officer" },
        },
      ],
    },
  ]);

  expect(html).toContain("Assigned by a manager");
});

it("keeps null signup attribution unknown in the slot UI", () => {
  const html = renderSection([
    {
      ...slots[1],
      event_time_slot_officers: [
        {
          officer_id: actorId,
          is_self_signup: isSelfTimeSlotSignup(null, "actor-auth-id"),
          officers: { id: actorId, name: "Current Officer" },
        },
      ],
    },
  ]);

  expect(html).toContain("Signup attribution unavailable");
  expect(html).not.toContain("Assigned by a manager");
  expect(html).not.toContain("Self signed up");
});

it("treats adjacent endpoints as non-conflicting and capacity boundaries as full", () => {
  expect(
    overlappingSlotPairs([
      {
        ...slots[0],
        starts_at: "2026-10-22T15:00:00.000Z",
        ends_at: "2026-10-22T15:30:00.000Z",
        position: 1,
      },
      {
        ...slots[1],
        starts_at: "2026-10-22T15:30:00.000Z",
        ends_at: "2026-10-22T16:00:00.000Z",
        position: 2,
      },
    ]),
  ).toEqual([]);
  expect(slotIsFull(1, 1)).toBe(true);
  expect(slotIsFull(1, 0)).toBe(false);
  expect(slotIsFull(null, 100)).toBe(false);
});

it("preserves a middle-slot gap when the middle slot is full", () => {
  const middleFull = [
    { ...slots[0], capacity: null },
    {
      ...slots[1],
      capacity: 1,
      event_time_slot_officers: [
        { officer_id: 8, officers: { id: 8, name: "Full Officer" } },
      ],
    },
    slots[2],
  ];

  const html = renderSection(middleFull);
  expect(html).toContain('type="checkbox" name="slot_ids" value="101"');
  expect(html).toContain("Slot 1: 09:00–09:30");
  expect(html).not.toContain('type="checkbox" name="slot_ids" value="102"');
  expect(html).toContain('type="checkbox" name="slot_ids" value="103"');
  expect(html).toContain("Slot 3: 10:00–10:30");
});

it("preserves a middle-slot gap and restores submitted IDs after a field error", () => {
  actionState.current = {
    error: "Review the selected slots",
    success: "",
    fieldErrors: { slot_ids: "Choose an available slot" },
    values: { slot_ids: ["101", "103"] },
  };

  const html = renderToStaticMarkup(
    <JoinSelectedTimeSlotsForm
      eventId={12}
      slots={[
        {
          id: 101,
          starts_at: slots[0].starts_at,
          ends_at: slots[0].ends_at,
          position: 1,
        },
        {
          id: 103,
          starts_at: slots[2].starts_at,
          ends_at: slots[2].ends_at,
          position: 3,
        },
      ]}
    />,
  );

  expect(html).toContain('checked="" value="101"');
  expect(html).toContain("Slot 1: 09:00–09:30");
  expect(html).toContain('checked="" value="103"');
  expect(html).toContain("Slot 3: 10:00–10:30");
  expect(html).toContain("Choose an available slot");
  expect(html).toContain('name="mode" value="join_selected"');
});

it("shows a historical assignment form for one signup and its current selections", () => {
  actionState.current = { error: "", success: "" };
  const html = renderToStaticMarkup(
    <CorrectHistoricalTimeSlotAssignmentsForm
      eventId={42}
      officerId={8}
      officerName="Full Officer"
      slots={slots.slice(0, 2)}
      selectedSlotIds={[101]}
    />,
  );

  expect(html).toContain("Correct selected Time Slots");
  expect(html).toContain('name="officer_id" value="8"');
  expect(html).toContain('checked="" value="101"');
  expect(html).toContain('name="slot_ids" value="102"');
  expect(html).toContain(">Save Time Slots</button>");
});
