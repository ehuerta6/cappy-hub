import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const taskListStatusSchema = searchParamStringSchema.transform((value) =>
  (["open", "in_progress", "complete"] as const).find(
    (status) => status === value,
  ),
);

export const taskListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  status: taskListStatusSchema,
  branch: optionalListIdSchema,
  assignee: optionalListIdSchema,
});

export type TaskListFilters = zod.infer<typeof taskListFiltersSchema>;
