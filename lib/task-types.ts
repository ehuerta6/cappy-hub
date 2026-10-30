import * as zod from "zod";

// The available values live in the Task Types catalog. Trusted SQL mutations
// validate that new selections are active and let an unchanged historical
// value remain on an existing Task.
export const taskTypeSchema = zod.string().trim().min(1, "Select a Task type");

export type TaskType = string;
