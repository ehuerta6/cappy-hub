import "server-only";
import { z } from "zod";

const idList = z
  .array(z.number().int().positive())
  .max(100)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Remove duplicate audience selections",
      });
  });

export const notificationSettingsInputSchema = z.object({
  all_active: z.boolean(),
  branch_ids: idList,
  position_ids: idList,
  reminder_offsets: z.array(z.number().int().min(1).max(43200)).max(6),
});

export function readNotificationSettings(
  form: FormData,
  defaultReminderOffsets: number[],
) {
  const submittedOffsets = form
    .getAll("reminder_offsets")
    .map((value) => String(value).trim());
  const offsets =
    submittedOffsets.length === 0
      ? defaultReminderOffsets
      : submittedOffsets.flatMap((raw) =>
          raw ? raw.split(",").map((offset) => Number(offset.trim())) : [],
        );
  return notificationSettingsInputSchema.safeParse({
    all_active: form.get("notification_all_active") === "on",
    branch_ids: form
      .getAll("notification_branches")
      .map((value) => Number(value)),
    position_ids: form
      .getAll("notification_positions")
      .map((value) => Number(value)),
    reminder_offsets: offsets,
  });
}

export function notificationSaveSettings(
  form: FormData,
  settings: z.infer<typeof notificationSettingsInputSchema>,
  creating: boolean,
) {
  const edited = form.getAll("edited_fields");
  const { all_active, branch_ids, position_ids, reminder_offsets } = settings;
  return {
    ...(creating || edited.includes("notification_audience")
      ? { audience: { all_active, branch_ids, position_ids } }
      : {}),
    ...(creating || edited.includes("reminder_offsets")
      ? { reminder_offsets }
      : {}),
  };
}

export function taskSaveSettings(
  form: FormData,
  settings: z.infer<typeof notificationSettingsInputSchema>,
  creating: boolean,
  dueTime: string,
) {
  return {
    ...notificationSaveSettings(form, settings, creating),
    ...(creating || form.getAll("edited_fields").includes("due_time")
      ? { due_time: dueTime || null }
      : {}),
  };
}
