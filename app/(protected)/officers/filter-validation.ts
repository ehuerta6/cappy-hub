import * as zod from "zod";
import {
  searchParamStringSchema,
  optionalListIdSchema,
} from "@/lib/search-params";

const officerListStatusSchema = searchParamStringSchema.transform((value) =>
  value === "inactive" || value === "all" ? value : "active",
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

export const officerListFiltersSchema = zod.object({
  q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
  scope: searchParamStringSchema.transform((value) =>
    value === "branch" ? "branch" : "all",
  ),
  status: officerListStatusSchema,
  position: optionalListIdSchema,
  branch: optionalListIdSchema,
  warnings: searchParamStringSchema.transform((value) =>
    value === "review" ? "review" : undefined,
  ),
  page: pageSchema,
});

export type OfficerListFilters = zod.infer<typeof officerListFiltersSchema>;
