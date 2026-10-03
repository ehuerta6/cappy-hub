import { expect, it } from "vitest";
import {
  createTaskInputSchema,
  taskActionInputSchema,
} from "@/app/(protected)/tasks/validation";

it("validates Task fields and operation-specific assignment input", () => {
  const validTask = {
    title: "Flyer",
    description: "Prepare the event flyer",
    task_type: "Flyer",
    branch_id: "-5",
    due_date: "2026-10-15",
    points: "1.5",
    approval_required: "on",
  };
  expect(createTaskInputSchema.safeParse(validTask).success).toBe(true);
  expect(
    createTaskInputSchema.safeParse({ ...validTask, points: "Infinity" })
      .success,
  ).toBe(false);
  expect(
    taskActionInputSchema.safeParse({
      task_id: "1",
      operation: "assign",
      officer_id: "-2",
    }).success,
  ).toBe(true);
  expect(
    taskActionInputSchema.safeParse({
      task_id: "1",
      operation: "assign",
    }).success,
  ).toBe(false);
});
