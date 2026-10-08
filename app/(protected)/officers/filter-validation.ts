import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const officerListStatusSchema = searchParamStringSchema.transform((value) =>
  value === "inactive" || value === "all" ? value : "active",
);

export const officerListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  status: officerListStatusSchema,
  position: optionalListIdSchema,
  branch: optionalListIdSchema,
});

export type OfficerListFilters = zod.infer<typeof officerListFiltersSchema>;
