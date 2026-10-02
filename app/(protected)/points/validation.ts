import * as zod from "zod";
import {
  finiteNumberStringSchema,
  safeIntegerStringSchema,
  optionalPositiveSafeIntegerStringSchema,
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
} from "@/lib/validation";

const pointHistorySearchParamValueSchema = zod
  .preprocess(
    (rawValue) => (rawValue === undefined ? "" : rawValue),
    zod.union([zod.string(), zod.array(zod.string())]),
  )
  .transform((rawValue) => (typeof rawValue === "string" ? rawValue : ""));

const optionalPointHistoryIdSchema = pointHistorySearchParamValueSchema
  .transform((rawValue) => rawValue.trim())
  .transform((rawValue) => {
    if (!rawValue) return undefined;
    const pointHistoryIdValidation = safeIntegerStringSchema(
      "Invalid Point History identifier",
    ).safeParse(rawValue);
    return pointHistoryIdValidation.success &&
      pointHistoryIdValidation.data !== 0
      ? pointHistoryIdValidation.data
      : undefined;
  });

const optionalPointHistoryDateSchema = pointHistorySearchParamValueSchema
  .transform((rawValue) => rawValue.trim())
  .transform((rawValue) => {
    if (!rawValue) return undefined;
    const pointHistoryDateValidation = zod.iso.date().safeParse(rawValue);
    return pointHistoryDateValidation.success
      ? pointHistoryDateValidation.data
      : undefined;
  });

const pointHistoryPageSchema = pointHistorySearchParamValueSchema
  .transform((rawValue) => rawValue.trim())
  .transform((rawValue) => {
    const pointHistoryPageValidation = safeIntegerStringSchema(
      "Invalid Point History page",
    ).safeParse(rawValue);
    return pointHistoryPageValidation.success &&
      pointHistoryPageValidation.data > 0
      ? Math.min(pointHistoryPageValidation.data, 100000)
      : 1;
  });

const pointHistoryAwardTypeSchema = pointHistorySearchParamValueSchema
  .transform((rawValue) => rawValue.trim())
  .transform((rawValue) =>
    ["participation", "task", "manual", "correction"].includes(rawValue)
      ? rawValue
      : undefined,
  );

const pointHistoryStatusSchema = pointHistorySearchParamValueSchema
  .transform((rawValue) => rawValue.trim())
  .transform((rawValue) =>
    ["active", "removed", "all"].includes(rawValue) ? rawValue : undefined,
  );

export const pointHistoryFiltersSchema = zod
  .object({
    q: pointHistorySearchParamValueSchema.transform((rawSearchQuery) =>
      rawSearchQuery.trim().slice(0, 100),
    ),
    type: pointHistoryAwardTypeSchema,
    officer: optionalPointHistoryIdSchema,
    event: optionalPointHistoryIdSchema,
    status: pointHistoryStatusSchema,
    from: optionalPointHistoryDateSchema,
    to: optionalPointHistoryDateSchema,
    page: pointHistoryPageSchema,
  })
  .transform((validatedPointHistoryFilters) => ({
    ...validatedPointHistoryFilters,
    dateRangeIsReversed:
      validatedPointHistoryFilters.from !== undefined &&
      validatedPointHistoryFilters.to !== undefined &&
      validatedPointHistoryFilters.from > validatedPointHistoryFilters.to,
  }));

export type PointHistoryFilters = zod.infer<typeof pointHistoryFiltersSchema>;

export function resolvePointHistoryStatus(
  requestedStatus: PointHistoryFilters["status"],
  isAdmin: boolean,
) {
  return isAdmin ? (requestedStatus ?? "active") : "active";
}

export const manualPointTransactionInputSchema = zod.object({
  points: finiteNumberStringSchema(
    "Enter a nonzero positive or negative point value",
  ).refine(
    (points) => points !== 0,
    "Enter a nonzero positive or negative point value",
  ),
  award_type: zod.enum(["manual", "correction"], {
    error: "Select manual or correction",
  }),
  reason: requiredTrimmedStringSchema("Enter a reason").transform((reason) =>
    reason.trim(),
  ),
  officer_id: positiveSafeIntegerStringSchema("Select an officer"),
  event_id: optionalPositiveSafeIntegerStringSchema("Select a valid event"),
});

export const participationRateInputSchema = zod.object({
  rate: finiteNumberStringSchema("Enter a finite positive rate").refine(
    (rate) => rate > 0,
    "Enter a finite positive rate",
  ),
});

export const pointTransactionInputSchema = zod.object({
  transaction_id: positiveSafeIntegerStringSchema("Invalid transaction"),
});

export const editPointTransactionInputSchema = zod.object({
  transaction_id: positiveSafeIntegerStringSchema(
    "Enter a finite nonzero point value",
  ),
  points: finiteNumberStringSchema("Enter a finite nonzero point value").refine(
    (points) => points !== 0,
    "Enter a finite nonzero point value",
  ),
});

export const eventSearchInputSchema = zod
  .string()
  .transform((term) => term.trim().slice(0, 80));
