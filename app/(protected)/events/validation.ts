import * as zod from "zod";
import {
  optionalSafeIntegerStringSchema,
  optionalPositiveSafeIntegerStringSchema,
  positiveSafeIntegerStringSchema,
  requiredTrimmedStringSchema,
  safeIntegerStringSchema,
} from "@/lib/validation";
import { recurrenceFieldsSchema } from "@/lib/recurrence-validation";

const eventDateInputSchema = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose one event date");

const eventTimeInputSchema = zod
  .string()
  .regex(
    /^\d{2}:\d{2}$/,
    "Choose a same-day range from 6:00 AM through 11:59 PM",
  );

const optionalHttpUrlSchema = zod
  .string()
  .transform((url) => url.trim())
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        Boolean(url.hostname)
      );
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS URL")
  .optional()
  .default("");

export const saveEventInputSchema = zod
  .object({
    id: optionalSafeIntegerStringSchema("Select a valid event"),
    name: requiredTrimmedStringSchema("Enter an event name"),
    description: requiredTrimmedStringSchema("Enter an event description"),
    event_type_id: positiveSafeIntegerStringSchema("Select an event type"),
    location: requiredTrimmedStringSchema("Enter an event location").trim(),
    event_date: eventDateInputSchema,
    start_time: eventTimeInputSchema,
    end_time: eventTimeInputSchema,
    branches: zod.array(safeIntegerStringSchema("Select valid branches")),
    slides_url: optionalHttpUrlSchema,
    meeting_notes_url: optionalHttpUrlSchema,
    signup_sheet_url: optionalHttpUrlSchema,
    max_volunteers: optionalPositiveSafeIntegerStringSchema(
      "Enter a positive whole number or leave Max volunteers blank",
    ),
  })
  .extend(recurrenceFieldsSchema.shape)
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

export const restoreEventInputSchema = zod.object({
  event_id: safeIntegerStringSchema("Select a valid event"),
});

const presenterSlotIdSchema = safeIntegerStringSchema(
  "Select a valid presenter slot",
);

export const presenterSlotRecordInputSchema = zod.object({
  slot_id: presenterSlotIdSchema,
});

export const changePresenterSlotInputSchema = zod.object({
  slot_id: presenterSlotIdSchema,
  officer_id: optionalSafeIntegerStringSchema("Select a valid officer"),
  release: zod.string().transform((value) => value === "true"),
});

export const reorderPresenterSlotsInputSchema = zod.object({
  event_id: safeIntegerStringSchema("Select a valid event"),
  slot_ids: zod.array(presenterSlotIdSchema).min(1, "Select presenter slots"),
});

const optionalSlotTextSchema = (maxLength: number, message: string) =>
  zod
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length <= maxLength, message);

export const presenterSlotDetailsInputSchema = zod.object({
  slot_id: presenterSlotIdSchema,
  presentation_title: optionalSlotTextSchema(
    200,
    "Keep the topic to 200 characters or fewer",
  ),
  difficulty: optionalSlotTextSchema(
    100,
    "Keep the difficulty to 100 characters or fewer",
  ),
  resource_url: optionalHttpUrlSchema,
  prep_notes: optionalSlotTextSchema(
    2000,
    "Keep the notes to 2000 characters or fewer",
  ),
});
