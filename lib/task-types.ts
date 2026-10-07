import * as zod from "zod";

export const TASK_TYPES = [
  "Flyer",
  "LinkedIn",
  "Airtable",
  "Story",
  "Post",
] as const;

export const taskTypeSchema = zod.enum(TASK_TYPES, {
  error: "Select a Task type",
});

export type TaskType = (typeof TASK_TYPES)[number];
