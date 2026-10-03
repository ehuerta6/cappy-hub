import * as zod from "zod";

export const recurrenceFieldsSchema = zod
  .object({
    recurrence_frequency: zod.enum(["none", "daily", "weekly"]).default("none"),
    recurrence_request_key: zod
      .uuid()
      .default("00000000-0000-4000-8000-000000000000"),
    recurrence_interval: zod
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((value) => Number.isInteger(value) && value >= 1 && value <= 52)
      .default(1),
    recurrence_weekdays: zod
      .array(zod.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
      .default([]),
    recurrence_end_mode: zod.enum(["count", "until"]).default("count"),
    recurrence_count: zod
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .refine((value) => Number.isInteger(value) && value >= 2 && value <= 500)
      .default(12),
    recurrence_until: zod
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .default("2099-12-31"),
  })
  .superRefine((input, context) => {
    if (
      input.recurrence_frequency === "weekly" &&
      !input.recurrence_weekdays.length
    )
      context.addIssue({
        code: "custom",
        path: ["recurrence_weekdays"],
        message: "Select at least one weekday",
      });
    if (
      input.recurrence_frequency === "daily" &&
      input.recurrence_weekdays.length
    )
      context.addIssue({
        code: "custom",
        path: ["recurrence_weekdays"],
        message: "Choose weekdays only for weekly recurrence",
      });
  });

export function recurrenceInput(
  input: zod.infer<typeof recurrenceFieldsSchema>,
) {
  if (input.recurrence_frequency === "none") return null;
  return {
    frequency: input.recurrence_frequency,
    interval: input.recurrence_interval,
    weekdays:
      input.recurrence_frequency === "weekly" ? input.recurrence_weekdays : [],
    count:
      input.recurrence_end_mode === "count" ? input.recurrence_count : null,
    until:
      input.recurrence_end_mode === "until" ? input.recurrence_until : null,
  } as const;
}
