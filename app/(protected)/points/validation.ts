import * as zod from "zod";
import {
  finiteNumberStringSchema,
  optionalPositiveSafeIntegerStringSchema,
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
} from "@/lib/validation";

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
