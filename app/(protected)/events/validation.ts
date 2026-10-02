import * as zod from "zod";
import {
  optionalSafeIntegerStringSchema,
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";

const eventDateInputSchema = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose one event date");

const eventTimeInputSchema = zod
  .string()
  .regex(
    /^\d{2}:\d{2}$/,
    "Choose a same-day range from 6:00 AM through 11:59 PM",
  );

export const saveEventInputSchema = zod
  .object({
    id: optionalSafeIntegerStringSchema("Select a valid event"),
    name: requiredTrimmedStringSchema(
      "Name, description and location are required",
    ),
    description: requiredTrimmedStringSchema(
      "Name, description and location are required",
    ),
    event_type_id: positiveSafeIntegerStringSchema("Select a valid event type"),
    location: requiredTrimmedStringSchema(
      "Name, description and location are required",
    ),
    event_date: eventDateInputSchema,
    start_time: eventTimeInputSchema,
    end_time: eventTimeInputSchema,
    branches: zod.array(safeIntegerStringSchema("Select valid branches")),
    slides_url: zod.string().transform((url) => url.trim()),
    meeting_notes_url: zod.string().transform((url) => url.trim()),
  })
  .superRefine((eventInput, context) => {
    if (
      eventInput.start_time < "06:00" ||
      eventInput.end_time > "23:59" ||
      eventInput.end_time <= eventInput.start_time
    ) {
      context.addIssue({
        code: "custom",
        path: ["start_time"],
        message: "Choose a same-day range from 6:00 AM through 11:59 PM",
      });
    }
  });

export const eventBranchIdsInputSchema = zod.array(
  safeIntegerStringSchema("Select valid branches"),
);

export const changeSignupInputSchema = zod.object({
  event_id: safeIntegerStringSchema("Select a valid event"),
  officer_id: safeIntegerStringSchema("Select a valid officer"),
  remove: zod.string().transform((value) => value === "true"),
});

export const bulkAddEventOfficersInputSchema = zod.object({
  event_id: zod
    .string()
    .trim()
    .min(1, "Select at least one officer")
    .transform(Number)
    .refine(
      (eventId) => Number.isSafeInteger(eventId) && eventId !== 0,
      "Select at least one officer",
    ),
  officer_ids: zod
    .array(
      zod
        .string()
        .regex(/^-?[1-9]\d*$/, "Select valid officers")
        .transform(Number)
        .refine(Number.isSafeInteger, "Select valid officers"),
    )
    .min(1, "Select at least one officer"),
});

export const eventRecordInputSchema = zod.object({
  event_id: safeIntegerStringSchema("Select a valid event"),
});
