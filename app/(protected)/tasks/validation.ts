import * as zod from "zod";
import {
  finiteNumberStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";

export const createTaskInputSchema = zod.object({
  title: zod
    .string()
    .refine((title) => title.trim().length > 0, "Invalid task fields"),
  description: zod
    .string()
    .refine(
      (description) => description.trim().length > 0,
      "Invalid task fields",
    ),
  task_type: zod.enum(["Flyer", "LinkedIn", "Airtable", "Story", "Post"], {
    error: "Invalid task fields",
  }),
  branch_id: safeIntegerStringSchema("Invalid task fields"),
  due_date: zod.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid task fields"),
  points: finiteNumberStringSchema("Invalid task fields").refine(
    (points) => points > 0,
    "Invalid task fields",
  ),
  approval_required: zod
    .string()
    .transform((approvalRequired) => approvalRequired === "on"),
});

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
