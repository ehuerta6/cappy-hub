import * as zod from "zod";
import {
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
} from "@/lib/validation";

export const createWarningInputSchema = zod.object({
  officer_id: positiveSafeIntegerStringSchema("Officer not found"),
  reason: requiredTrimmedStringSchema("Warning reason is required").transform(
    (reason) => reason.trim(),
  ),
});

export const decideWarningInputSchema = zod.object({
  warning_id: positiveSafeIntegerStringSchema("Warning not found"),
  decision: zod.enum(["approved", "rejected"], {
    error: "Invalid warning decision",
  }),
});

export const voidWarningInputSchema = zod.object({
  warning_id: positiveSafeIntegerStringSchema("Warning not found"),
  officer_id: zod
    .string()
    .transform(Number)
    .transform((officerId) =>
      Number.isSafeInteger(officerId) && officerId > 0 ? officerId : undefined,
    ),
});
