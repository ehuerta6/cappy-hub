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

const eventTimeSlotSchema = zod.object({
  id: zod.number().int().positive().optional(),
  start_time: eventTimeInputSchema,
  end_time: eventTimeInputSchema,
  capacity: zod.number().int().positive().nullable(),
});

export const eventTimeSlotsInputSchema = zod.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (!value || value === "null") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, zod.array(eventTimeSlotSchema).min(1).max(24).nullable());

export function timeSlotBoundsError(
  slots: zod.infer<typeof eventTimeSlotSchema>[] | null,
  eventStart: string,
  eventEnd: string,
) {
  if (slots === null) return undefined;
  const ordered = [...slots].sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const slot = ordered[index];
    if (
      slot.start_time >= slot.end_time ||
      slot.start_time < eventStart ||
      slot.end_time > eventEnd
    )
      return "Each Time Slot must fit within the Event schedule and end after it starts";
    if (index > 0 && ordered[index - 1].end_time > slot.start_time)
      return "Time Slots cannot overlap";
  }
  return undefined;
}

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
