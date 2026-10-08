import { expect, it } from "vitest";
import { organizeTaskList } from "@/lib/task-list";
import { formatTaskDueDate } from "@/lib/presentation";

const task = (
  id: number,
  due_date: string,
  removed_at: string | null = null,
) => ({ id, due_date, removed_at });

it("organizes today-through-Sunday and upcoming dates nearest first", () => {
  const result = organizeTaskList(
    [
      task(1, "2026-10-05"),
      task(3, "2026-10-11"),
      task(2, "2026-10-08"),
      task(4, "2026-10-12"),
      task(5, "2026-10-04"),
      task(6, "2026-10-12", "2026-10-01T00:00:00Z"),
    ],
    "current",
    "2026-10-05",
    "2026-10-11",
  );

  expect(result.view).toBe("current");
  if (result.view !== "current") return;
  expect(result.thisWeek.map(({ id }) => id)).toEqual([1, 2, 3]);
  expect(result.upcoming.map(({ id }) => id)).toEqual([4]);
});

it("shows only pre-today Tasks in Past, newest due first with deterministic ties", () => {
  const result = organizeTaskList(
    [
      task(1, "2026-10-04"),
      task(4, "2026-10-03"),
      task(3, "2026-10-03"),
      task(2, "2026-10-05"),
      task(5, "2026-10-02", "2026-10-01T00:00:00Z"),
    ],
    "past",
    "2026-10-05",
    "2026-10-11",
  );

  expect(result.view).toBe("past");
  if (result.view !== "past") return;
  expect(result.tasks.map(({ id }) => id)).toEqual([1, 4, 3]);
});

it("shows archived Tasks only in the explicit Archived view", () => {
  const result = organizeTaskList(
    [task(1, "2026-10-04", "2026-10-01T00:00:00Z"), task(2, "2026-10-05")],
    "archived",
    "2026-10-05",
    "2026-10-11",
  );
  expect(result.view).toBe("archived");
  if (result.view === "archived")
    expect(result.tasks.map(({ id }) => id)).toEqual([1]);
});

it("keeps due Sunday current and moves Monday to Upcoming after Denver week rollover", () => {
  const before = organizeTaskList(
    [task(1, "2026-10-11"), task(2, "2026-10-12")],
    "current",
    "2026-10-05",
    "2026-10-11",
  );
  expect(
    before.view === "current" && before.thisWeek.map(({ id }) => id),
  ).toEqual([1]);
  expect(
    before.view === "current" && before.upcoming.map(({ id }) => id),
  ).toEqual([2]);

  const after = organizeTaskList(
    [task(1, "2026-10-11"), task(2, "2026-10-12")],
    "current",
    "2026-10-12",
    "2026-10-18",
  );
  expect(
    after.view === "current" && after.thisWeek.map(({ id }) => id),
  ).toEqual([2]);
  expect(after.view === "current" && after.upcoming).toEqual([]);
});

it("formats Task due dates as concise Denver calendar dates without UTC shifts", () => {
  const now = new Date("2026-10-05T06:00:00.000Z");

  expect(formatTaskDueDate("2026-10-07", now)).toBe("Oct 7");
  expect(formatTaskDueDate("2027-10-07", now)).toBe("Oct 7, 2027");
  expect(
    formatTaskDueDate("2026-01-01", new Date("2026-01-01T07:30:00Z")),
  ).toBe("Jan 1");
});
