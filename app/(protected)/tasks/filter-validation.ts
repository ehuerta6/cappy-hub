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

const pageSchema = searchParamStringSchema.transform((value) => {
  const parsed = zod
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine(Number.isSafeInteger)
    .safeParse(value.trim());
  return parsed.success && parsed.data > 0 ? Math.min(parsed.data, 100_000) : 1;
});

export const taskListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  view: searchParamStringSchema.transform((value) =>
    value === "past"
      ? value
      : value === "deleted" || value === "archived"
        ? "deleted"
        : undefined,
  ),
  status: taskListStatusSchema,
  branch: optionalListIdSchema,
  assignee: optionalListIdSchema,
  page: pageSchema,
});

export type TaskListFilters = zod.infer<typeof taskListFiltersSchema>;
