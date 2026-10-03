import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const optionalOfficerListStatusSchema = searchParamStringSchema.transform(
  (value) => (value === "active" || value === "inactive" ? value : undefined),
);

export const officerListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  status: optionalOfficerListStatusSchema,
  position: optionalListIdSchema,
  branch: optionalListIdSchema,
});

export type OfficerListFilters = zod.infer<typeof officerListFiltersSchema>;
