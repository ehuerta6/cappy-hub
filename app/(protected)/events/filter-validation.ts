import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const eventListStatusSchema = searchParamStringSchema.transform((value) =>
  (["upcoming", "happening", "past", "cancelled", "archived"] as const).find(
    (status) => status === value,
  ),
);

export const eventListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  status: eventListStatusSchema,
  type: optionalListIdSchema,
  branch: optionalListIdSchema,
});

export type EventListFilters = zod.infer<typeof eventListFiltersSchema>;
