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

export const updateWarningInputSchema = createWarningInputSchema
  .pick({ reason: true })
  .extend({
    warning_id: positiveSafeIntegerStringSchema("Warning not found"),
  });

export const warningLifecycleInputSchema = zod.object({
  warning_id: positiveSafeIntegerStringSchema("Warning not found"),
  officer_id: zod
    .string()
    .transform(Number)
    .transform((officerId) =>
      Number.isSafeInteger(officerId) && officerId > 0 ? officerId : undefined,
    ),
});
