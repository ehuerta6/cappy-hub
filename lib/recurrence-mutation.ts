import * as zod from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeIntegerStringSchema } from "@/lib/validation";
import {
  canonicalRecurrenceRule,
  expandRecurrenceDates,
  recurrenceEditStart,
  recurrenceFromRule,
} from "@/lib/recurrence";
import {
  recurrenceFieldsSchema,
  recurrenceInput,
} from "@/lib/recurrence-validation";
import type { Json } from "@/lib/database.types";

export const recurrenceScopeSchema = zod.enum([
  "occurrence",
  "following",
  "series",
]);
const mutationSchema = zod.object({
  scope: recurrenceScopeSchema,
  series_id: safeIntegerStringSchema("Select a valid series"),
  revision: zod
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine(Number.isSafeInteger),
  request_key: zod.uuid(),
});

/** Produces a validated RPC request; the database independently checks identity,
 * revision, dates, authorization, field allowlists and protected workflow state. */
export async function recurrenceMutation(
  domain: "event" | "task",
  selectedId: number,
  form: FormData,
  operation: "edit" | "remove" | "cancel",
  values: Record<string, Json> = {},
) {
  const input = mutationSchema.parse({
    scope: form.get("scope"),
    series_id: form.get("recurrence_series_id"),
    revision: form.get("recurrence_revision"),
    request_key: form.get("mutation_request_key"),
  });
  const supabase = await createClient();
  const patch: Record<string, Json> = {};
  for (const name of form.getAll("edited_fields")) {
    if (typeof name !== "string" || !Object.hasOwn(values, name))
      throw new Error("Invalid recurrence edit fields");
    patch[name] = values[name];
  }
  let rule: string | undefined;
  let dates: string[] | undefined;
  const dateField = domain === "event" ? "event_date" : "due_date";
  if (
    operation === "edit" &&
    input.scope !== "occurrence" &&
    (dateField in patch || form.get("change_recurrence") === "on")
  ) {
    // Submitted schedule snapshots keep the derived RPC payload stable on a
    // retry after a split. They confer no authority: SQL checks the real selected
    // row, series revision and complete expanded schedule while holding locks.
    const snapshotSchema = zod.object({
      rule: zod
        .string()
        .regex(
          /^RRULE:FREQ=(DAILY|WEEKLY);INTERVAL=\d+(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?;(COUNT=\d+|UNTIL=\d{8})$/,
        ),
      start: zod.iso.date(),
      key: zod.iso.date(),
      date: zod.iso.date(),
    });
    let snapshot;
    if (form.has("recurrence_original_rule")) {
      snapshot = snapshotSchema.parse({
        rule: form.get("recurrence_original_rule"),
        start: form.get("recurrence_original_start"),
        key: form.get("recurrence_original_key"),
        date: form.get("recurrence_original_date"),
      });
    } else {
      const [seriesResult, rowResult] = await Promise.all([
        supabase
          .from(domain === "event" ? "event_series" : "task_series")
          .select("*")
          .eq("id", input.series_id)
          .single(),
        domain === "event"
          ? supabase
              .from("events")
              .select("recurrence_key,event_date")
              .eq("id", selectedId)
              .single()
          : supabase
              .from("tasks")
              .select("recurrence_key,due_date")
              .eq("id", selectedId)
              .single(),
      ]);
      const series = seriesResult.data;
      const row = rowResult.data;
      if (
        seriesResult.error ||
        rowResult.error ||
        !series?.starts_on ||
        !row?.recurrence_key
      )
        throw new Error("Recurring series not found");
      snapshot = snapshotSchema.parse({
        rule: series.recurrence_rule,
        start: series.starts_on,
        key: row.recurrence_key,
        date: "event_date" in row ? row.event_date : row.due_date,
      });
    }
    let recurrence = recurrenceFromRule(snapshot.rule);
    let start = input.scope === "following" ? snapshot.key : snapshot.start;
    if (input.scope === "following" && recurrence.count !== null) {
      recurrence = {
        ...recurrence,
        count: expandRecurrenceDates(snapshot.start, recurrence, true).filter(
          (date) => date >= snapshot.key,
        ).length,
      };
    }
    if (dateField in patch) {
      start = recurrenceEditStart({
        scope: input.scope,
        seriesStart: snapshot.start,
        selectedKey: snapshot.key,
        selectedDate: snapshot.date,
        editedDate: String(patch[dateField]),
      });
      delete patch[dateField];
    }
    if (form.get("change_recurrence") === "on") {
      const fields = Object.fromEntries([...form.entries()]);
      const parsed = recurrenceFieldsSchema.safeParse({
        ...fields,
        recurrence_weekdays: form.getAll("recurrence_weekdays"),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const replacement = recurrenceInput(parsed.data);
      if (!replacement) throw new Error("Choose a repeating schedule");
      recurrence = replacement;
    }
    dates = expandRecurrenceDates(start, recurrence, true);
    rule = canonicalRecurrenceRule(recurrence);
  }
  return {
    p_selected_id: selectedId,
    p_scope: input.scope,
    p_operation: operation,
    p_request_key: input.request_key,
    p_series_id: input.series_id,
    p_revision: input.revision,
    p_patch: patch,
    ...(rule ? { p_rule: rule, p_dates: dates } : {}),
  };
}

export function recurrenceMutationError(error: unknown) {
  if (error instanceof zod.ZodError) return error.issues[0].message;
  return error instanceof Error ? error.message : "Invalid recurrence edit";
}
