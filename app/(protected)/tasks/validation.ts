import * as zod from "zod";
import {
  finiteNumberStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";
import { recurrenceFieldsSchema } from "@/lib/recurrence-validation";
import { taskTypeSchema } from "@/lib/task-types";

export const createTaskInputSchema = zod
  .object({
    title: zod
      .string()
      .refine((title) => title.trim().length > 0, "Enter a Task title"),
    description: zod
      .string()
      .refine(
        (description) => description.trim().length > 0,
        "Enter a Task description",
      ),
    task_type: taskTypeSchema,
    branch_id: safeIntegerStringSchema("Select a branch"),
    due_date: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
    points: finiteNumberStringSchema("Enter a positive point value").refine(
      (points) => points > 0,
      "Enter a positive point value",
    ),
  })
  .extend(recurrenceFieldsSchema.shape);

export const taskDetailsInputSchema = zod.object({
  title: zod
    .string()
    .refine((title) => title.trim().length > 0, "Enter a Task title"),
  description: zod
    .string()
    .refine(
      (description) => description.trim().length > 0,
      "Enter a Task description",
    ),
  task_type: taskTypeSchema,
  branch_id: safeIntegerStringSchema("Select a branch"),
  due_date: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  points: finiteNumberStringSchema("Enter a positive point value").refine(
    (points) => points > 0,
    "Enter a positive point value",
  ),
});

export const taskEventIdsSchema = zod
  .array(safeIntegerStringSchema("Select valid Events"))
  .max(500, "Select no more than 500 Events")
  .refine((ids) => new Set(ids).size === ids.length, "Select each Event once");

export const taskRecordInputSchema = zod.object({
  task_id: safeIntegerStringSchema("Task not found"),
});

const taskAssignmentActionSchema = taskRecordInputSchema.extend({
  officer_id: safeIntegerStringSchema("Officer not found"),
});

export const bulkTaskAssignmentInputSchema = taskRecordInputSchema.extend({
  officer_ids: zod
    .array(safeIntegerStringSchema("Officer not found"))
    .min(1, "Select at least one officer")
    .max(200, "Select no more than 200 officers")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Select each officer once",
    ),
});

export const removeTaskAssignmentInputSchema = taskAssignmentActionSchema;

export const setTaskCompletionInputSchema = taskAssignmentActionSchema.extend({
  completed: zod
    .enum(["true", "false"], {
      error: "Select a completion state",
    })
    .transform((value) => value === "true"),
});
