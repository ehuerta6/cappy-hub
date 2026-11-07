import * as zod from "zod";
import {
  finiteNumberStringSchema,
  safeIntegerStringSchema,
  optionalSafeIntegerStringSchema,
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
    ["participation", "task", "manual", "correction", "negative"].includes(
      rawValue,
    )
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

const pointRankingPageSchema = pointHistorySearchParamValueSchema
  .transform((value) => value.trim())
  .transform((value) => {
    const validation = safeIntegerStringSchema(
      "Invalid ranking page",
    ).safeParse(value);
    return validation.success && validation.data > 0
      ? Math.min(validation.data, 100000)
      : 1;
  });

export function parsePointRankingPage(value: string | string[] | undefined) {
  const result = pointRankingPageSchema.safeParse(value);
  return result.success ? result.data : 1;
}

const historyParameterNames = [
  "q",
  "type",
  "officer",
  "event",
  "status",
  "from",
  "to",
  "page",
] as const;

export function resolvePointsView(
  params: Record<string, string | string[] | undefined>,
): "overview" | "history" {
  if (params.view === "history") return "history";
  if (params.view === "overview") return "overview";
  return historyParameterNames.some((name) => {
    const value = params[name];
    return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
  })
    ? "history"
    : "overview";
}

export function resolvePointHistoryStatus(
  requestedStatus: PointHistoryFilters["status"],
  isAdmin: boolean,
) {
  return isAdmin ? (requestedStatus ?? "active") : "active";
}

export const manualPointTransactionInputSchema = zod
  .object({
    points: finiteNumberStringSchema(
      "Enter a nonzero positive or negative point value",
    ).refine(
      (points) => points !== 0,
      "Enter a nonzero positive or negative point value",
    ),
    award_type: zod.enum(["manual", "correction", "negative"], {
      error: "Select manual, correction, or negative Point",
    }),
    reason: requiredTrimmedStringSchema("Enter a reason").transform((reason) =>
      reason.trim(),
    ),
    officer_id: safeIntegerStringSchema("Select an officer").refine(
      (identifier) => identifier !== 0,
      "Select an officer",
    ),
    event_id: optionalSafeIntegerStringSchema("Select a valid event").refine(
      (identifier) => identifier === undefined || identifier !== 0,
      "Select a valid event",
    ),
    task_id: zod
      .preprocess(
        (value) => value ?? "",
        optionalSafeIntegerStringSchema("Select a valid task"),
      )
      .refine(
        (identifier) => identifier === undefined || identifier !== 0,
        "Select a valid task",
      ),
  })
  .superRefine((value, context) => {
    if (value.award_type === "negative" && value.points !== -1) {
      context.addIssue({
        code: "custom",
        path: ["points"],
        message: "A negative Point is exactly -1",
      });
    }
    if (value.event_id !== undefined && value.task_id !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["task_id"],
        message: "Choose an Event or a Task, not both",
      });
    }
    if (value.award_type !== "negative" && value.task_id !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["task_id"],
        message: "Only a negative Point can link to a Task",
      });
    }
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
