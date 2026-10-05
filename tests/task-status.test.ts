import { describe, expect, it } from "vitest";
import {
  splitTasksByOfficer,
  taskProgressLabel,
  taskStatus,
} from "@/lib/task-status";

describe("Task assignment summaries", () => {
  it("defines open, in-progress, and complete from all assignments", () => {
    expect(taskStatus([])).toBe("Open");
    expect(taskStatus([{ officer_id: 1, completed_at: null }])).toBe(
      "In progress",
    );
    expect(
      taskStatus([
        { officer_id: 1, completed_at: "2026-10-01T12:00:00Z" },
        { officer_id: 2, completed_at: null },
      ]),
    ).toBe("In progress");
    expect(
      taskStatus([
        { officer_id: 1, completed_at: "2026-10-01T12:00:00Z" },
        { officer_id: 2, completed_at: "2026-10-02T12:00:00Z" },
      ]),
    ).toBe("Complete");
  });

  it("shows assignment completion counts without flattening mixed work", () => {
    expect(taskProgressLabel([])).toBe("0 officers");
    expect(
      taskProgressLabel([
        { officer_id: 1, completed_at: "2026-10-01T12:00:00Z" },
        { officer_id: 2, completed_at: null },
        { officer_id: 3, completed_at: null },
      ]),
    ).toBe("1/3 completed");
  });

  it("groups by the signed-in Officer assignment, not other Officers", () => {
    const tasks = [
      {
        id: 1,
        task_officer_assignments: [{ officer_id: 10, completed_at: null }],
      },
      {
        id: 2,
        task_officer_assignments: [{ officer_id: 11, completed_at: null }],
      },
      { id: 3, task_officer_assignments: [] },
    ];
    const groups = splitTasksByOfficer(tasks, 10);
    expect(groups.yourTasks.map(({ id }) => id)).toEqual([1]);
    expect(groups.otherTasks.map(({ id }) => id)).toEqual([2, 3]);
  });
});
