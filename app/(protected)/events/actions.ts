"use server";

import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { denverTimestamp } from "@/lib/event-time";
import {
  canonicalRecurrenceRule,
  expandRecurrenceDates,
} from "@/lib/recurrence";
import {
  recurrenceMutation,
  recurrenceMutationError,
} from "@/lib/recurrence-mutation";
import { recurrenceInput } from "@/lib/recurrence-validation";
import { revalidatePath } from "next/cache";
import { withReturnTo } from "@/lib/return-context";
import { withSuccessNotice } from "@/lib/mutation-feedback";
import { redirect } from "next/navigation";
import { syncGoogleCalendarEvents } from "@/lib/google-calendar-sync";
import {
  bulkAddEventOfficersInputSchema,
  changeSignupInputSchema,
  eventTimeSlotsInputSchema,
  eventBranchIdsInputSchema,
  eventRecordInputSchema,
  restoreEventInputSchema,
  saveEventInputSchema,
  timeSlotBoundsError,
} from "./validation";

const eventFormFields = [
  "name",
  "description",
  "event_type_id",
  "location",
  "event_date",
  "start_time",
  "end_time",
  "branches",
  "slides_url",
  "meeting_notes_url",
  "signup_sheet_url",
  "max_volunteers",
  "time_slots",
  "recurrence_frequency",
  "recurrence_interval",
  "recurrence_weekdays",
  "recurrence_end_mode",
  "recurrence_count",
  "recurrence_until",
] as const;
const eventFieldErrors = eventFormFields;
const calendarSyncWarning =
  "Cappy Hub saved this Event, but Google Calendar could not be updated.";
export async function saveEvent(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  const rawBranchIds = formData.getAll("branches");
  const branchValidationResult =
    eventBranchIdsInputSchema.safeParse(rawBranchIds);
  const branchIdsForAuthorization = branchValidationResult.success
    ? branchValidationResult.data
    : [];
  if (!formData.get("id") && !canManageEvent(actor, branchIdsForAuthorization))
    return formFailure(
      "Event outside branch scope",
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );

  const rawEventInput = {
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    event_type_id: formData.get("event_type_id") ?? "",
    location: formData.get("location") ?? "",
    event_date: formData.get("event_date") ?? "",
    start_time: formData.get("start_time") ?? "",
    end_time: formData.get("end_time") ?? "",
    branches: formData.getAll("branches"),
    slides_url: formData.get("slides_url") ?? "",
    meeting_notes_url: formData.get("meeting_notes_url") ?? "",
    signup_sheet_url: formData.get("signup_sheet_url") ?? "",
    max_volunteers: formData.get("max_volunteers") ?? "",
    recurrence_frequency: formData.get("recurrence_frequency") ?? "none",
    recurrence_request_key:
      formData.get("recurrence_request_key") ?? crypto.randomUUID(),
    recurrence_interval: formData.get("recurrence_interval") ?? "1",
    recurrence_weekdays: formData.getAll("recurrence_weekdays"),
    recurrence_end_mode: formData.get("recurrence_end_mode") ?? "count",
    recurrence_count: formData.get("recurrence_count") ?? "12",
    recurrence_until: formData.get("recurrence_until") ?? "2099-12-31",
  };
  const validationResult = saveEventInputSchema.safeParse(rawEventInput);
  if (!validationResult.success)
    return validationFailure(
      validationResult.error,
      formData,
      eventFieldErrors,
      ["branches", "recurrence_weekdays"],
    );
  const validatedEventInput = validationResult.data;
  const timeSlotsValidation = eventTimeSlotsInputSchema.safeParse(
    formData.get("time_slots"),
  );
  if (!timeSlotsValidation.success)
    return formFailure(
      "Enter valid Time Slot settings",
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  const timeSlots = timeSlotsValidation.data;
  const usesTimeSlots = (timeSlots?.length ?? 0) > 0;
  const slotBoundsError = timeSlotBoundsError(
    timeSlots,
    validatedEventInput.start_time,
    validatedEventInput.end_time,
  );
  if (slotBoundsError)
    return formFailure(slotBoundsError, formData, eventFormFields, undefined, [
      "branches",
      "recurrence_weekdays",
    ]);

  const start = denverTimestamp(
    validatedEventInput.event_date,
    validatedEventInput.start_time,
  );
  const end = denverTimestamp(
    validatedEventInput.event_date,
    validatedEventInput.end_time,
  );
  if (!start || !end)
    return formFailure(
      "Enter valid El Paso times",
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  const supabase = await createClient();
  if (validatedEventInput.id && formData.has("recurrence_series_id")) {
    const beforeIds = await recurringEventIdsForScope(
      supabase,
      formData,
      validatedEventInput.id,
      false,
    );
    try {
      const args = await recurrenceMutation(
        "event",
        validatedEventInput.id,
        formData,
        "edit",
        {
          name: validatedEventInput.name,
          description: validatedEventInput.description,
          event_type_id: validatedEventInput.event_type_id,
          location: validatedEventInput.location,
          event_date: validatedEventInput.event_date,
          start_time: validatedEventInput.start_time,
          end_time: validatedEventInput.end_time,
          branch_ids: validatedEventInput.branches,
          slides_url: validatedEventInput.slides_url,
          meeting_notes_url: validatedEventInput.meeting_notes_url,
          signup_sheet_url: validatedEventInput.signup_sheet_url,
          max_volunteers: usesTimeSlots
            ? null
            : (validatedEventInput.max_volunteers ?? null),
          time_slots: timeSlots,
        },
      );
      const { error } = await supabase.rpc(
        "mutate_recurring_event_with_capacity_and_time_slots",
        args,
      );
      if (error)
        return formFailure(
          mutationError(error.message),
          formData,
          eventFormFields,
          undefined,
          ["branches", "recurrence_weekdays"],
        );
    } catch (error) {
      return formFailure(
        recurrenceMutationError(error),
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    }
    revalidatePath("/", "layout");
    const afterIds = await recurringEventIdsForScope(
      supabase,
      formData,
      validatedEventInput.id,
      true,
    );
    const synced = await syncGoogleCalendarEvents(
      [
        ...new Set([
          ...(beforeIds ?? [validatedEventInput.id]),
          ...(afterIds ?? [validatedEventInput.id]),
        ]),
      ],
      supabase,
    );
    if (!synced || !beforeIds || !afterIds)
      return formFailure(
        calendarSyncWarning,
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    redirect(
      withSuccessNotice(
        withReturnTo(
          `/events/${validatedEventInput.id}`,
          formData.get("returnTo"),
        ),
        "event-saved",
      ),
    );
    return { error: "", success: "" };
  }
  const recurrence = recurrenceInput(validatedEventInput);
  if (recurrence && validatedEventInput.id)
    return formFailure(
      "Recurrence can only be set when creating a new event",
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  if (recurrence) {
    let dates: string[];
    try {
      dates = expandRecurrenceDates(validatedEventInput.event_date, recurrence);
    } catch (error) {
      return formFailure(
        error instanceof Error ? error.message : "Invalid recurrence",
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    }
    const starts = dates.map((date) =>
      denverTimestamp(date, validatedEventInput.start_time),
    );
    const ends = dates.map((date) =>
      denverTimestamp(date, validatedEventInput.end_time),
    );
    if (starts.some((value) => !value) || ends.some((value) => !value))
      return formFailure(
        "A recurring occurrence falls on an invalid El Paso time",
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    const { data, error } = await supabase.rpc(
      "create_recurring_event_with_capacity_and_time_slots",
      {
        p_name: validatedEventInput.name,
        p_description: validatedEventInput.description,
        p_event_type_id: validatedEventInput.event_type_id,
        p_location: validatedEventInput.location,
        p_branch_ids: validatedEventInput.branches,
        p_slides_url: validatedEventInput.slides_url,
        p_meeting_notes_url: validatedEventInput.meeting_notes_url,
        p_signup_sheet_url: validatedEventInput.signup_sheet_url,
        p_max_volunteers: usesTimeSlots
          ? 0
          : (validatedEventInput.max_volunteers ?? 0),
        p_request_key: validatedEventInput.recurrence_request_key,
        p_recurrence_rule: canonicalRecurrenceRule(recurrence),
        p_event_dates: dates,
        p_starts_at: starts as string[],
        p_ends_at: ends as string[],
        p_time_slots: timeSlots,
      },
    );
    if (error)
      return formFailure(
        mutationError(error.message),
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    revalidatePath("/", "layout");
    const eventIds = await recurringEventIdsFromFirstOccurrence(supabase, data);
    const synced = await syncGoogleCalendarEvents(eventIds ?? [data], supabase);
    if (!synced || !eventIds)
      return formFailure(
        calendarSyncWarning,
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    redirect(
      withSuccessNotice(
        withReturnTo(`/events/${data}`, formData.get("returnTo")),
        "event-saved",
      ),
    );
  }
  const { data, error } = await supabase.rpc(
    "save_event_with_capacity_and_time_slots",
    {
      p_event_id: validatedEventInput.id,
      p_name: validatedEventInput.name,
      p_description: validatedEventInput.description,
      p_event_type_id: validatedEventInput.event_type_id,
      p_location: validatedEventInput.location,
      p_event_date: validatedEventInput.event_date,
      p_starts_at: start,
      p_ends_at: end,
      p_branch_ids: validatedEventInput.branches,
      p_slides_url: validatedEventInput.slides_url,
      p_meeting_notes_url: validatedEventInput.meeting_notes_url,
      p_signup_sheet_url: validatedEventInput.signup_sheet_url,
      p_max_volunteers: usesTimeSlots
        ? 0
        : (validatedEventInput.max_volunteers ?? 0),
      p_time_slots: timeSlots,
    },
  );
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  revalidatePath("/", "layout");
  const synced = await syncGoogleCalendarEvents([data], supabase);
  if (!synced)
    return formFailure(
      calendarSyncWarning,
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  redirect(
    withSuccessNotice(
      withReturnTo(`/events/${data}`, formData.get("returnTo")),
      "event-saved",
    ),
  );
}
export async function changeSignup(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const rawSignupInput = {
    event_id: formData.get("event_id") ?? "",
    officer_id: formData.get("officer_id") ?? "",
    remove: formData.get("remove") ?? "",
  };
  const validationResult = changeSignupInputSchema.safeParse(rawSignupInput);
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, [
      "event_id",
      "officer_id",
      "remove",
    ]);
  const validatedSignupInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: validatedSignupInput.event_id,
    p_officer_id: validatedSignupInput.officer_id,
    p_remove: validatedSignupInput.remove,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      ["event_id", "officer_id", "remove"],
      undefined,
    );
  revalidatePath("/", "layout");
  return {
    error: "",
    success: validatedSignupInput.remove
      ? "Signup removed"
      : "Confirmed signup saved",
  };
}
export async function selfSignup(
  previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  const signup = new FormData();
  signup.set("event_id", String(formData.get("event_id") ?? ""));
  signup.set("officer_id", String(actor.id));
  const result = await changeSignup(previous, signup);
  return result;
}

export async function bulkAddEventOfficers(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const rawBulkAddEventOfficersInput = {
    event_id: formData.get("event_id") ?? "",
    officer_ids: formData.getAll("officer_ids"),
  };
  const validationResult = bulkAddEventOfficersInputSchema.safeParse(
    rawBulkAddEventOfficersInput,
  );
  if (!validationResult.success)
    return validationFailure(
      validationResult.error,
      formData,
      ["event_id", "officer_ids"],
      ["officer_ids"],
    );
  const validatedBulkAddEventOfficersInput = validationResult.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_add_event_officers", {
    p_event_id: validatedBulkAddEventOfficersInput.event_id,
    p_officer_ids: validatedBulkAddEventOfficersInput.officer_ids,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      ["event_id", "officer_ids"],
      undefined,
      ["officer_ids"],
    );
  revalidatePath("/", "layout");
  const result = data as {
    added_officer_ids?: number[];
    awarded_officer_ids?: number[];
    points_per_officer?: number | null;
  };
  const count = result.added_officer_ids?.length ?? 0;
  const awards = result.awarded_officer_ids?.length ?? 0;
  return {
    error: "",
    success:
      awards > 0
        ? `Added ${count} attendee${count === 1 ? "" : "s"}; awarded ${awards} officer${awards === 1 ? "" : "s"} ${result.points_per_officer} points each`
        : count > 0
          ? `Added ${count} officer${count === 1 ? "" : "s"}`
          : "No changes were needed; selected officers were already added.",
  };
}
export async function restoreDeletedEvent(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const restoreEventValidationResult = restoreEventInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!restoreEventValidationResult.success)
    return {
      error: restoreEventValidationResult.error.issues[0].message,
      success: "",
    };
  const supabase = await createClient();
  const lifecycle = recurringLifecycleFields(formData);
  const result = lifecycle
    ? await supabase.rpc("mutate_recurring_event_lifecycle", {
        p_selected_id: restoreEventValidationResult.data.event_id,
        p_scope: lifecycle.scope,
        p_operation: "restore",
        p_request_key: lifecycle.requestKey,
        p_series_id: lifecycle.seriesId,
        p_revision: lifecycle.revision,
      })
    : await supabase.rpc("restore_deleted_event", {
        p_event_id: restoreEventValidationResult.data.event_id,
      });
  const error = result.error;
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  revalidatePath("/events");
  revalidatePath("/system-log");
  if (
    !(await syncGoogleCalendarEvents(
      Array.isArray(result.data)
        ? (result.data as number[])
        : [restoreEventValidationResult.data.event_id],
      supabase,
    ))
  )
    return { error: calendarSyncWarning, success: "" };
  return { error: "", success: "Event restored" };
}

export async function deleteEvent(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const validationResult = eventRecordInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const lifecycle = recurringLifecycleFields(formData);
  const result = lifecycle
    ? await supabase.rpc("mutate_recurring_event_lifecycle", {
        p_selected_id: validationResult.data.event_id,
        p_scope: lifecycle.scope,
        p_operation: "delete",
        p_request_key: lifecycle.requestKey,
        p_series_id: lifecycle.seriesId,
        p_revision: lifecycle.revision,
      })
    : await supabase.rpc("delete_event", {
        p_event_id: validationResult.data.event_id,
      });
  const { data, error } = result;
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  revalidatePath("/events");
  revalidatePath("/system-log");
  if (
    !(await syncGoogleCalendarEvents(
      (data as number[] | boolean | null) instanceof Array
        ? (data as number[])
        : [validationResult.data.event_id],
      supabase,
    ))
  )
    return { error: calendarSyncWarning, success: "" };
  return {
    error: "",
    success: lifecycle || data ? "Event deleted" : "Event was already deleted",
  };
}

function recurringLifecycleFields(formData: FormData) {
  const seriesId = Number(formData.get("recurrence_series_id"));
  const revision = Number(formData.get("recurrence_revision"));
  const requestKey = String(formData.get("mutation_request_key") ?? "");
  const scope = String(formData.get("scope") ?? "occurrence");
  if (
    !Number.isSafeInteger(seriesId) ||
    seriesId < 1 ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestKey,
    ) ||
    !["occurrence", "following", "series"].includes(scope)
  )
    return null;
  return { seriesId, revision, requestKey, scope };
}

export async function restoreEvent(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const validation = restoreEventInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_event", {
    p_event_id: validation.data.event_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  if (!(await syncGoogleCalendarEvents([validation.data.event_id], supabase)))
    return { error: calendarSyncWarning, success: "" };
  return { error: "", success: "Event restored" };
}

async function recurringEventIdsForScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  selectedEventId: number,
  afterMutation: boolean,
): Promise<number[] | null> {
  const scope = formData.get("scope");
  if (scope === "occurrence") return [selectedEventId];
  if (scope !== "following" && scope !== "series") return null;

  const originalSeriesId = Number(formData.get("recurrence_series_id"));
  if (!Number.isInteger(originalSeriesId) || originalSeriesId <= 0) return null;
  const { data: selected, error: selectedError } = await supabase
    .from("events")
    .select("recurrence_series_id,recurrence_key")
    .eq("id", selectedEventId)
    .maybeSingle();
  if (selectedError || !selected) return null;

  const seriesIds = new Set([originalSeriesId]);
  if (afterMutation && selected.recurrence_series_id !== null)
    seriesIds.add(selected.recurrence_series_id);
  const { data: occurrences, error } = await supabase
    .from("events")
    .select("id,recurrence_key,recurrence_series_id")
    .in("recurrence_series_id", [...seriesIds]);
  if (error || !occurrences) return null;
  const selectedKey = selected.recurrence_key;
  return [
    ...new Set([
      selectedEventId,
      ...occurrences
        .filter(
          (occurrence) =>
            scope === "series" ||
            (selectedKey !== null &&
              occurrence.recurrence_key !== null &&
              occurrence.recurrence_key >= selectedKey),
        )
        .map((occurrence) => occurrence.id),
    ]),
  ];
}

async function recurringEventIdsFromFirstOccurrence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  firstEventId: number,
): Promise<number[] | null> {
  const { data: first, error: firstError } = await supabase
    .from("events")
    .select("recurrence_series_id")
    .eq("id", firstEventId)
    .single();
  if (firstError || !first?.recurrence_series_id) return null;
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("recurrence_series_id", first.recurrence_series_id);
  if (error || !data) return null;
  return data.map((event) => event.id);
}
