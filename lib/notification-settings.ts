import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function saveEventNotificationSettings(
  supabase: SupabaseClient,
  eventId: number,
  form: FormData,
  settings: z.infer<typeof notificationSettingsInputSchema>,
) {
  const eventResult = await supabase
    .from("events")
    .select("recurrence_series_id")
    .eq("id", eventId)
    .single();
  if (eventResult.error)
    throw new Error("Could not load Event notification scope");
  const seriesId = eventResult.data.recurrence_series_id;
  let scope = "occurrence";
  let revision: number | null = null;
  if (seriesId !== null) {
    const series = await supabase
      .from("event_series")
      .select("revision")
      .eq("id", seriesId)
      .single();
    if (series.error)
      throw new Error("Could not load recurring Event settings");
    revision = series.data.revision;
    const submittedScope = form.get("scope");
    scope = !form.has("recurrence_series_id")
      ? "series"
      : submittedScope === "following" || submittedScope === "series"
        ? submittedScope
        : "occurrence";
  }
  const { error } = await supabase.rpc("set_event_notification_settings", {
    p_event_id: eventId,
    p_all_active: settings.all_active,
    p_branch_ids: settings.branch_ids,
    p_position_ids: settings.position_ids,
    p_reminder_offsets: settings.reminder_offsets,
    p_scope: scope,
    p_series_id: seriesId ?? undefined,
    p_series_revision: revision ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function saveTaskNotificationSettings(
  supabase: SupabaseClient,
  taskId: number,
  form: FormData,
  settings: z.infer<typeof notificationSettingsInputSchema>,
) {
  const taskResult = await supabase
    .from("tasks")
    .select("recurrence_series_id")
    .eq("id", taskId)
    .single();
  if (taskResult.error)
    throw new Error("Could not load Task notification scope");
  const seriesId = taskResult.data.recurrence_series_id;
  let scope = "occurrence";
  let revision: number | null = null;
  if (seriesId !== null) {
    const series = await supabase
      .from("task_series")
      .select("revision")
      .eq("id", seriesId)
      .single();
    if (series.error) throw new Error("Could not load recurring Task settings");
    revision = series.data.revision;
    const submittedScope = form.get("scope");
    scope = !form.has("recurrence_series_id")
      ? "series"
      : submittedScope === "following" || submittedScope === "series"
        ? submittedScope
        : "occurrence";
  }
  const { error } = await supabase.rpc("set_task_notification_settings", {
    p_task_id: taskId,
    p_all_active: settings.all_active,
    p_branch_ids: settings.branch_ids,
    p_position_ids: settings.position_ids,
    p_reminder_offsets: settings.reminder_offsets,
    p_scope: scope,
    p_series_id: seriesId ?? undefined,
    p_series_revision: revision ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function saveTaskDueTime(
  supabase: SupabaseClient,
  taskId: number,
  form: FormData,
) {
  const raw = String(form.get("due_time") ?? "");
  const dueTime = raw === "" ? null : raw;
  if (dueTime !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime))
    throw new Error("Enter a valid due time");
  if (dueTime === null && !form.has("task_id")) return;

  const task = await supabase
    .from("tasks")
    .select("recurrence_series_id")
    .eq("id", taskId)
    .single();
  if (task.error) throw new Error("Could not load Task due time");
  const seriesId = task.data.recurrence_series_id;
  let scope = "occurrence";
  let revision: number | null = null;
  if (seriesId !== null) {
    const series = await supabase
      .from("task_series")
      .select("revision")
      .eq("id", seriesId)
      .single();
    if (series.error) throw new Error("Could not load recurring Task scope");
    revision = series.data.revision;
    const submittedScope = form.get("scope");
    scope = !form.has("recurrence_series_id")
      ? "series"
      : submittedScope === "following" || submittedScope === "series"
        ? submittedScope
        : "occurrence";
  }
  const { error } = await supabase.rpc("set_task_due_time", {
    p_task_id: taskId,
    // Supabase's generated Args type treats SQL parameters as non-nullable;
    // PostgreSQL accepts NULL here to clear an existing optional due time.
    p_due_time: dueTime as string,
    p_scope: scope,
    p_series_id: seriesId ?? undefined,
    p_series_revision: revision ?? undefined,
  });
  if (error) throw new Error(error.message);
}
