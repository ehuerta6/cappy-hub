import * as zod from "zod";
import { searchParamStringSchema } from "@/lib/search-params";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const actorSchema = searchParamStringSchema.transform((value) => {
  if (value === "system") return value;
  return uuidPattern.test(value) ? value : undefined;
});

const entityTypeSchema = searchParamStringSchema.transform((value) =>
  [
    "application_config",
    "branch",
    "event",
    "event_location",
    "event_series",
    "event_type",
    "officer",
    "point_transaction",
    "position",
    "task",
    "task_series",
    "warning",
  ].includes(value)
    ? value
    : undefined,
);

const optionalLogDateSchema = searchParamStringSchema.transform((value) => {
  if (!value) return undefined;
  const parsed = zod.iso.date().safeParse(value);
  return parsed.success ? parsed.data : undefined;
});

const logPageSchema = searchParamStringSchema.transform((value) => {
  const parsed = zod
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine(Number.isSafeInteger)
    .safeParse(value.trim());
  return parsed.success && parsed.data > 0 ? Math.min(parsed.data, 100_000) : 1;
});

export const systemLogFiltersSchema = zod
  .object({
    q: searchParamStringSchema.transform((value) => value.trim().slice(0, 100)),
    actor: actorSchema,
    action: searchParamStringSchema.transform((value) =>
      value.trim().slice(0, 80),
    ),
    entity: entityTypeSchema,
    from: optionalLogDateSchema,
    to: optionalLogDateSchema,
    page: logPageSchema,
  })
  .transform((filters) => ({
    ...filters,
    dateRangeIsReversed:
      filters.from !== undefined &&
      filters.to !== undefined &&
      filters.from > filters.to,
  }));

export type SystemLogFilters = zod.infer<typeof systemLogFiltersSchema>;
