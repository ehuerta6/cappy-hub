// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Route } from "next";
import {
  computeOfficerActivityMap,
  formatTaskCompletionLabel,
  type ActivityEventSignupInput,
  type ActivityTaskAssignmentInput,
} from "@/lib/officer-activity";
import OfficerActivityTable from "@/app/(protected)/officers/activity-table";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("computeOfficerActivityMap", () => {
  const today = "2026-11-27";

  it("computes due Task completion %, keeps pending approval separate, excludes upcoming & No longer needed, and separates Volunteer vs Attend events", () => {
    const taskAssignments: ActivityTaskAssignmentInput[] = [
      // Officer 1: 1 approved due, 1 pending approval due (not counted in numerator), 1 upcoming (not in denominator), 1 NLN (excluded)
      {
        officer_id: 1,
        completed_at: "2026-11-20T12:00:00Z",
        completion_approval_pending: false,
        removed_at: null,
        tasks: {
          due_date: "2026-11-20",
          removed_at: null,
          no_longer_needed_at: null,
        },
      },
      {
        officer_id: 1,
        completed_at: "2026-11-22T12:00:00Z",
        completion_approval_pending: true,
        removed_at: null,
        tasks: {
          due_date: "2026-11-22",
          removed_at: null,
          no_longer_needed_at: null,
        },
      },
      {
        officer_id: 1,
        completed_at: null,
        completion_approval_pending: false,
        removed_at: null,
        tasks: {
          due_date: "2026-12-05",
          removed_at: null,
          no_longer_needed_at: null,
        },
      },
      {
        officer_id: 1,
        completed_at: null,
        completion_approval_pending: false,
        removed_at: null,
        tasks: {
          due_date: "2026-11-15",
          removed_at: null,
          no_longer_needed_at: "2026-11-16T00:00:00Z",
        },
      },
      // Officer 2: only upcoming task -> "No Tasks due"
      {
        officer_id: 2,
        completed_at: null,
        completion_approval_pending: false,
        removed_at: null,
        tasks: {
          due_date: "2026-12-01",
          removed_at: null,
          no_longer_needed_at: null,
        },
      },
    ];

    const eventSignups: ActivityEventSignupInput[] = [
      // Duplicate occurrence for Officer 1 (e.g. multiple slot rows) counts once
      {
        officer_id: 1,
        event_id: 100,
        participation_type: "volunteer",
        removed_at: null,
        events: {
          id: 100,
          event_date: "2026-11-10",
          deleted_at: null,
          status: "past",
        },
      },
      {
        officer_id: 1,
        event_id: 100,
        participation_type: "volunteer",
        removed_at: null,
        events: {
          id: 100,
          event_date: "2026-11-10",
          deleted_at: null,
          status: "past",
        },
      },
      {
        officer_id: 1,
        event_id: 101,
        participation_type: "attendee",
        removed_at: null,
        events: {
          id: 101,
          event_date: "2026-11-15",
          deleted_at: null,
          status: "past",
        },
      },
      // Cancelled event and removed signup excluded
      {
        officer_id: 1,
        event_id: 102,
        participation_type: "volunteer",
        removed_at: null,
        events: {
          id: 102,
          event_date: "2026-11-16",
          deleted_at: null,
          status: "cancelled",
        },
      },
      {
        officer_id: 1,
        event_id: 103,
        participation_type: "attendee",
        removed_at: "2026-11-17T00:00:00Z",
        events: {
          id: 103,
          event_date: "2026-11-18",
          deleted_at: null,
          status: "past",
        },
      },
    ];

    const map = computeOfficerActivityMap(
      [1, 2],
      taskAssignments,
      eventSignups,
      today,
    );

    const o1 = map.get(1)!;
    expect(o1.dueTasksCount).toBe(2);
    expect(o1.completedDueTasksCount).toBe(1);
    expect(o1.pendingApprovalTasksCount).toBe(1);
    expect(o1.upcomingTasksCount).toBe(1);
    expect(o1.taskCompletionPercent).toBe(50);
    expect(formatTaskCompletionLabel(o1)).toBe("50%");
    expect(o1.volunteerEventsCount).toBe(1);
    expect(o1.attendEventsCount).toBe(1);
    expect(o1.totalRecordedEventsCount).toBe(2);

    const o2 = map.get(2)!;
    expect(o2.dueTasksCount).toBe(0);
    expect(o2.upcomingTasksCount).toBe(1);
    expect(o2.taskCompletionPercent).toBeNull();
    expect(formatTaskCompletionLabel(o2)).toBe("No Tasks due");
    expect(o2.totalRecordedEventsCount).toBe(0);
  });
});

describe("OfficerActivityTable", () => {
  it("renders separate Task completion % and Volunteer/Attend recorded event counts and supports sorting", () => {
    const rows = [
      {
        id: 1,
        name: "Alpha Officer",
        status: "active",
        positionName: "Officer",
        branches: [{ name: "intro" }],
        profileHref: "/officers/1" as Route,
        activity: {
          dueTasksCount: 0,
          completedDueTasksCount: 0,
          pendingApprovalTasksCount: 0,
          upcomingTasksCount: 2,
          taskCompletionPercent: null,
          volunteerEventsCount: 1,
          attendEventsCount: 0,
          totalRecordedEventsCount: 1,
        },
      },
      {
        id: 2,
        name: "Beta Lead",
        status: "active",
        positionName: "Lead",
        branches: [{ name: "icpc" }],
        profileHref: "/officers/2" as Route,
        activity: {
          dueTasksCount: 4,
          completedDueTasksCount: 3,
          pendingApprovalTasksCount: 1,
          upcomingTasksCount: 0,
          taskCompletionPercent: 75,
          volunteerEventsCount: 3,
          attendEventsCount: 2,
          totalRecordedEventsCount: 5,
        },
      },
    ];

    const html = renderToStaticMarkup(
      createElement(OfficerActivityTable, {
        rows,
        periodLabel: "Fall 2026",
      }),
    );
    expect(html).toContain("No Tasks due");
    expect(html).toContain("75%");
    expect(html).toContain("1 pending");
    expect(html).toContain("recorded signups, not verified attendance");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(OfficerActivityTable, {
          rows,
          periodLabel: "Fall 2026",
        }),
      );
    });

    const sortByEventsBtn = Array.from(
      container.querySelectorAll("button"),
    ).find((b) => b.textContent === "Recorded events");
    expect(sortByEventsBtn).toBeDefined();

    act(() => {
      sortByEventsBtn!.click();
    });

    const firstRowName = container.querySelector("tbody tr td a")?.textContent;
    expect(firstRowName).toBe("Beta Lead");

    act(() => {
      root.unmount();
    });
  });
});
