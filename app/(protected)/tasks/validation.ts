import * as zod from "zod";
import {
  finiteNumberStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";
import { recurrenceFieldsSchema } from "@/lib/recurrence-validation";

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
    task_type: zod.enum(["Flyer", "LinkedIn", "Airtable", "Story", "Post"], {
      error: "Select a Task type",
    }),
    branch_id: safeIntegerStringSchema("Select a branch"),
    due_date: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
    points: finiteNumberStringSchema("Enter a positive point value").refine(
      (points) => points > 0,
      "Enter a positive point value",
    ),
    approval_required: zod
      .string()
      .transform((approvalRequired) => approvalRequired === "on"),
  })
  .extend(recurrenceFieldsSchema.shape);

const taskActionCommonInputSchema = zod.object({
  task_id: safeIntegerStringSchema("Task not found"),
});

export const taskActionInputSchema = zod.discriminatedUnion(
  "operation",
  [
    taskActionCommonInputSchema.extend({
      operation: zod.literal("assign"),
      officer_id: safeIntegerStringSchema("Officer not found"),
    }),
    taskActionCommonInputSchema.extend({
      operation: zod.literal("complete"),
    }),
    taskActionCommonInputSchema.extend({
      operation: zod.literal("approve"),
    }),
  ],
  { error: "Unknown task action" },
);

export const taskRecordInputSchema = zod.object({
  task_id: safeIntegerStringSchema("Task not found"),
});
