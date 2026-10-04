import { expect, it } from "vitest";
import { presentAuditEntry } from "@/lib/system-log-presentation";

it.each([
  [
    "event.signup",
    "Noel Lozano signed up for Arrays Workshop",
    "Noel Lozano signed up",
  ],
  [
    "event.officer_assigned",
    "Assigned Noel Lozano to Arrays Workshop",
    "Assigned to Noel Lozano",
  ],
])(
  "presents %s activity with the named Officer and Event",
  (action, activity, summary) => {
    const result = presentAuditEntry(
      {
        action,
        entity_type: "event",
        entity_id: 123,
        details: { officer_id: 42 },
      },
      {
        officerNames: new Map([[42, "Noel Lozano"]]),
        eventNames: new Map([[123, "Arrays Workshop"]]),
        availableEventIds: new Set([123]),
      },
    );

    expect(result.activity).toBe(activity);
    expect(result.record).toEqual({
      label: "Arrays Workshop",
      href: "/events/123",
    });
    expect(result.detailSummary).toBe(summary);
  },
);

it("renders readable before and after values for an Officer role change", () => {
  const result = presentAuditEntry({
    action: "officer.role_changed",
    entity_type: "officer",
    entity_id: "42",
    details: {
      officer_name: "Noel Lozano",
      old_role: "officer",
      new_role: "admin",
    },
  });

  expect(result.activity).toBe("Changed Noel Lozano's application role");
  expect(result.record.label).toBe("Noel Lozano");
  expect(result.changes).toEqual([
    { label: "Application role", value: "Officer → Admin" },
  ]);
});

it("uses lifecycle snapshots to show a readable Event status change", () => {
  const result = presentAuditEntry({
    action: "event.cancelled",
    entity_type: "event",
    entity_id: 123,
    details: {
      name: "Arrays Workshop",
      previous_status: "upcoming",
      new_status: "cancelled",
    },
  });

  expect(result.record.label).toBe("Arrays Workshop");
  expect(result.changes).toEqual([
    { label: "Status", value: "Upcoming → Cancelled" },
  ]);
});

it("combines point awards with their Officer and Event context", () => {
  const result = presentAuditEntry(
    {
      action: "points.participation_created",
      entity_type: "point_transaction",
      entity_id: 801,
      details: { event_id: 123, officer_id: 42, points: 3 },
    },
    {
      officerNames: new Map([[42, "Noel Lozano"]]),
      eventNames: new Map([[123, "Arrays Workshop"]]),
      availableEventIds: new Set([123]),
    },
  );

  expect(result.activity).toBe(
    "Awarded participation points (3 points) for Noel Lozano · Arrays Workshop",
  );
  expect(result.record).toEqual({
    label: "Arrays Workshop",
    href: "/events/123",
  });
});

it("keeps a removed Task's historical title without linking to its detail route", () => {
  const result = presentAuditEntry(
    {
      action: "task.removed",
      entity_type: "task",
      entity_id: 17,
      details: { title: "Prepare interview kit" },
    },
    {
      taskNames: new Map(),
      availableTaskIds: new Set(),
    },
  );

  expect(result.record).toEqual({ label: "Prepare interview kit" });
});

it("links a Task when its current record is still available", () => {
  const result = presentAuditEntry(
    {
      action: "task.updated",
      entity_type: "task",
      entity_id: 18,
      details: {},
    },
    {
      taskNames: new Map([[18, "Review solutions"]]),
      availableTaskIds: new Set([18]),
    },
  );

  expect(result.record).toEqual({
    label: "Review solutions",
    href: "/tasks/18",
  });
});

it("names the affected Officer in a warning entry", () => {
  const result = presentAuditEntry({
    action: "warning.created",
    entity_type: "warning",
    entity_id: 900,
    details: {
      officer_id: 42,
      officer_name: "Noel Lozano",
      reason: "Repeated missed deadlines",
    },
  });

  expect(result.activity).toBe("Recorded a warning for Noel Lozano");
  expect(result.record.label).toBe("Noel Lozano");
  expect(result.detailSummary).toBe("Repeated missed deadlines");
});

it("uses a safe fallback for unknown legacy actions and unfamiliar payloads", () => {
  const result = presentAuditEntry({
    action: "legacy.action_from_an_old_release",
    entity_type: "event",
    entity_id: "123",
    details: ["unexpected", "legacy", "payload"],
  });

  expect(result.activity).toBe(
    "Recorded an activity with an unrecognized action",
  );
  expect(result.record.label).toBe("Event #123");
  expect(result.detailSummary).toBe("Additional audit data recorded");
  expect(result.changes).toEqual([]);
});
