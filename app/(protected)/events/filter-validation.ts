import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const eventListStatusSchema = searchParamStringSchema.transform((value) => {
  const normalized = value === "archived" ? "deleted" : value;
  return (
    ["upcoming", "happening", "past", "cancelled", "deleted"] as const
  ).find((status) => status === normalized);
});

export const eventListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  status: eventListStatusSchema,
  type: optionalListIdSchema,
  branch: optionalListIdSchema,
  page: searchParamStringSchema.transform((value) => {
    const page = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(page) && page > 0
      ? Math.min(page, 100_000)
      : 1;
  }),
});

export type EventListFilters = zod.infer<typeof eventListFiltersSchema>;
