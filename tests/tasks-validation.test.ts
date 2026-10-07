import { expect, it } from "vitest";
import {
  createTaskInputSchema,
  taskDetailsInputSchema,
  bulkTaskAssignmentInputSchema,
  setTaskCompletionInputSchema,
} from "@/app/(protected)/tasks/validation";
import { TASK_TYPES } from "@/lib/task-types";

it("accepts every supported Task type for create and edit", () => {
  const baseTask = {
    title: "Task",
    description: "Prepare the content",
    branch_id: "-5",
    due_date: "2026-10-15",
    points: "1.5",
  };

  for (const taskType of TASK_TYPES) {
    expect(
      createTaskInputSchema.safeParse({ ...baseTask, task_type: taskType })
        .success,
    ).toBe(true);
    expect(
      taskDetailsInputSchema.safeParse({ ...baseTask, task_type: taskType })
        .success,
    ).toBe(true);
  }

  expect(
    createTaskInputSchema.safeParse({ ...baseTask, task_type: "Other" })
      .success,
  ).toBe(false);
});

it("validates Task details without an approval field", () => {
  const validTask = {
    title: "Flyer",
    description: "Prepare the event flyer",
    task_type: "Flyer",
    branch_id: "-5",
    due_date: "2026-10-15",
    points: "1.5",
  };
  expect(createTaskInputSchema.safeParse(validTask).success).toBe(true);
  expect(taskDetailsInputSchema.safeParse(validTask).success).toBe(true);
  expect(
    createTaskInputSchema.safeParse({ ...validTask, approval_required: "on" })
      .success,
  ).toBe(true);
  expect(
    createTaskInputSchema.safeParse({ ...validTask, points: "Infinity" })
      .success,
  ).toBe(false);
  expect(
    bulkTaskAssignmentInputSchema.safeParse({
      task_id: "1",
      officer_ids: ["-2", "-3"],
    }).success,
  ).toBe(true);
  expect(
    bulkTaskAssignmentInputSchema.safeParse({
      task_id: "1",
      officer_ids: ["-2", "-2"],
    }).success,
  ).toBe(false);
  expect(
    setTaskCompletionInputSchema.parse({
      task_id: "1",
      officer_id: "-2",
      completed: "false",
    }).completed,
  ).toBe(false);
});
