"use server";

import {
  getAuthorizationContext,
  canEditEvent,
  canRecoverEventCalendarSync,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { denverTimestamp } from "@/lib/event-time";
import { academicPeriodForDate } from "@/lib/academic-periods";
import { currentDenverWeek } from "@/lib/current-denver-week";
import type { Route } from "next";
import {
  canonicalRecurrenceRule,
  expandRecurrenceDates,
} from "@/lib/recurrence";
import {
  recurrenceMutation,
  recurrenceMutationError,
} from "@/lib/recurrence-mutation";
import { recurrenceInput } from "@/lib/recurrence-validation";
import {
  readNotificationSettings,
  notificationSaveSettings,
} from "@/lib/notification-settings";
import { revalidateEventPaths } from "@/lib/revalidation";
import { withReturnTo } from "@/lib/return-context";
import { withSuccessNotice } from "@/lib/mutation-feedback";
import { redirect } from "next/navigation";
import {
  isGoogleCalendarSyncEnabled,
  syncGoogleCalendarEvents,
} from "@/lib/google-calendar-sync";
import {
  bulkAddEventOfficersInputSchema,
  changeSignupInputSchema,
  eventTimeSlotsInputSchema,
  eventRecordInputSchema,
  restoreEventInputSchema,
  saveEventInputSchema,
  timeSlotBoundsError,
  eventCreateOfficerIdsSchema,
  eventCreateOfficerSignupsSchema,
  eventRosterScopeSchema,
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
  "resource_links",
  "max_volunteers",
  "time_slots",
  "officer_ids",
  "roster_scope",
  "recurrence_frequency",
  "recurrence_interval",
  "recurrence_weekdays",
  "recurrence_end_mode",
  "recurrence_count",
  "recurrence_until",
  "notification_all_active",
  "notification_branches",
  "notification_positions",
  "reminder_offsets",
] as const;
const eventFieldErrors = eventFormFields;
const eventMultipleFields = [
  "branches",
  "recurrence_weekdays",
  "officer_ids",
  "notification_branches",
  "notification_positions",
] as const;
const calendarSyncWarning =
  "Cappy Hub saved this Event, but Google Calendar could not be updated.";
export async function saveEvent(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
  if (!formData.get("id") && !canEditEvent(actor))
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
    resource_links: formData.get("resource_links") ?? "[]",
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
  const officerIds = eventCreateOfficerIdsSchema.safeParse(
    formData
      .getAll("officer_ids")
      .filter((value): value is string => typeof value === "string"),
  );
  if (!officerIds.success)
    return validationFailure(
      officerIds.error,
      formData,
      eventFieldErrors,
      eventMultipleFields,
    );
  const officerSignups = eventCreateOfficerSignupsSchema.safeParse(
    officerIds.data.map((officerId) => ({
      officer_id: String(officerId),
      participation_type:
        formData.get(`participation_type_${officerId}`) ?? "volunteer",
      slot_indexes: formData
        .getAll(`officer_slot_indexes_${officerId}`)
        .filter((value): value is string => typeof value === "string"),
    })),
  );
  if (!officerSignups.success)
    return validationFailure(
      officerSignups.error,
      formData,
      eventFieldErrors,
      eventMultipleFields,
    );
  const rosterScope = eventRosterScopeSchema.safeParse(
    formData.get("roster_scope") ?? "occurrence",
  );
  if (officerSignups.data.length && !rosterScope.success)
    return validationFailure(
      rosterScope.error,
      formData,
      eventFieldErrors,
      eventMultipleFields,
    );
  const legacyUrl = (key: "slides" | "meeting_notes" | "signup_sheet") =>
    validatedEventInput.resource_links.find(
      (resource) => resource.legacy_key === key,
    )?.url ?? "";
  const resourceLinksChanged = formData
    .getAll("edited_fields")
    .includes("resource_links");
  const notificationSettings = readNotificationSettings(formData, [1440, 60]);
  if (!notificationSettings.success)
    return formFailure(
      notificationSettings.error.issues[0]?.message ??
        "Review reminder settings",
      formData,
      eventFormFields,
      undefined,
      eventMultipleFields,
    );
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
  if (!validatedEventInput.id && usesTimeSlots && officerSignups.data.length) {
    const invalidSignup = officerSignups.data.find(
      (signup) =>
        (signup.participation_type === "volunteer" &&
          (signup.slot_indexes.length === 0 ||
            signup.slot_indexes.some((index) => index > timeSlots!.length))) ||
        signup.participation_type === "attendee",
    );
    if (invalidSignup)
      return formFailure(
        invalidSignup.participation_type === "attendee"
          ? "Attend registrations are unavailable when Time Slots are configured."
          : "Select at least one configured Time Slot for each Volunteer.",
        formData,
        eventFormFields,
        undefined,
        eventMultipleFields,
      );
  }
  if (
    !validatedEventInput.id &&
    !usesTimeSlots &&
    officerSignups.data.some((signup) => signup.slot_indexes.length > 0)
  )
    return formFailure(
      "Selected Time Slots are not configured for this Event.",
      formData,
      eventFormFields,
      undefined,
      eventMultipleFields,
    );
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
  const saveSettings = notificationSaveSettings(
    formData,
    notificationSettings.data,
    validatedEventInput.id === undefined,
  );
  if (validatedEventInput.id && formData.has("recurrence_series_id")) {
    let calendarEventIds: number[];
    try {
      const recurrenceForm = new FormData();
      for (const [name, value] of formData.entries()) {
        if (
          name !== "edited_fields" ||
          ![
            "resource_links",
            "notification_audience",
            "reminder_offsets",
          ].includes(String(value))
        )
          recurrenceForm.append(name, value);
      }
      const args = await recurrenceMutation(
        "event",
        validatedEventInput.id,
        recurrenceForm,
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
          slides_url: legacyUrl("slides"),
          meeting_notes_url: legacyUrl("meeting_notes"),
          signup_sheet_url: legacyUrl("signup_sheet"),
          max_volunteers: usesTimeSlots
            ? null
            : (validatedEventInput.max_volunteers ?? null),
          time_slots: timeSlots,
        },
      );
      const { data, error } = await supabase.rpc(
        "mutate_recurring_event_with_resources_atomic",
        {
          ...args,
          p_save_settings: saveSettings,
          ...(resourceLinksChanged
            ? { p_resource_links: validatedEventInput.resource_links }
            : {}),
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
      calendarEventIds = data?.[0]?.calendar_event_ids ?? [];
    } catch (error) {
      return formFailure(
        recurrenceMutationError(error),
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    }
    revalidateEventPaths(validatedEventInput.id);
    const synced =
      calendarEventIds.length > 0 &&
      (await syncGoogleCalendarEvents(calendarEventIds, supabase));
    redirect(
      withSuccessNotice(
        await resolveEventDetailPath(
          supabase,
          validatedEventInput.id,
          formData.get("returnTo"),
        ),
        synced ? "event-saved" : "event-saved-calendar-warning",
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
      "create_recurring_event_with_resources_atomic",
      {
        p_save_settings: saveSettings,
        p_name: validatedEventInput.name,
        p_description: validatedEventInput.description,
        p_event_type_id: validatedEventInput.event_type_id,
        p_location: validatedEventInput.location,
        p_branch_ids: validatedEventInput.branches,
        p_slides_url: legacyUrl("slides"),
        p_meeting_notes_url: legacyUrl("meeting_notes"),
        p_signup_sheet_url: legacyUrl("signup_sheet"),
        p_max_volunteers: usesTimeSlots
          ? 0
          : (validatedEventInput.max_volunteers ?? 0),
        p_request_key: validatedEventInput.recurrence_request_key,
        p_recurrence_rule: canonicalRecurrenceRule(recurrence),
        p_event_dates: dates,
        p_starts_at: starts as string[],
        p_ends_at: ends as string[],
        p_time_slots: timeSlots,
        p_resource_links: validatedEventInput.resource_links,
        ...(officerSignups.data.length
          ? {
              p_officer_signups: officerSignups.data.map((signup) => ({
                ...signup,
                slot_indexes: signup.slot_indexes,
              })),
              p_roster_scope: rosterScope.data,
            }
          : {}),
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
    const saved = data?.[0];
    if (!saved) throw new Error("Recurring Event save returned no identity");
    revalidateEventPaths(saved.event_id);
    const synced =
      saved.calendar_event_ids.length > 0 &&
      (await syncGoogleCalendarEvents(saved.calendar_event_ids, supabase));
    redirect(
      withSuccessNotice(
        await resolveEventDetailPath(
          supabase,
          saved.event_id,
          formData.get("returnTo"),
        ),
        synced ? "event-saved" : "event-saved-calendar-warning",
      ),
    );
  }
  const { data, error } = await supabase.rpc(
    "save_event_with_resources_atomic",
    {
      p_save_settings: saveSettings,
      p_request_key: validatedEventInput.recurrence_request_key,
      ...(validatedEventInput.id !== undefined
        ? { p_event_id: validatedEventInput.id }
        : {}),
      p_name: validatedEventInput.name,
      p_description: validatedEventInput.description,
      p_event_type_id: validatedEventInput.event_type_id,
      p_location: validatedEventInput.location,
      p_event_date: validatedEventInput.event_date,
      p_starts_at: start,
      p_ends_at: end,
      p_branch_ids: validatedEventInput.branches,
      p_slides_url: legacyUrl("slides"),
      p_meeting_notes_url: legacyUrl("meeting_notes"),
      p_signup_sheet_url: legacyUrl("signup_sheet"),
      p_max_volunteers: usesTimeSlots
        ? 0
        : (validatedEventInput.max_volunteers ?? 0),
      p_time_slots: timeSlots,
      p_resource_links: validatedEventInput.resource_links,
      ...(officerSignups.data.length && !validatedEventInput.id
        ? {
            p_officer_signups: officerSignups.data.map((signup) => ({
              ...signup,
              slot_indexes: signup.slot_indexes,
            })),
            p_roster_scope: rosterScope.data,
          }
        : {}),
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
  revalidateEventPaths(data);
  const synced = await syncGoogleCalendarEvents([data], supabase);
  redirect(
    withSuccessNotice(
      await resolveEventDetailPath(supabase, data, formData.get("returnTo")),
      synced ? "event-saved" : "event-saved-calendar-warning",
    ),
  );
}
export async function changeSignup(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
  const rawSignupInput = {
    event_id: formData.get("event_id") ?? "",
    officer_id: formData.get("officer_id") ?? "",
    remove: formData.get("remove") ?? "",
    participation_type: formData.get("participation_type") ?? "volunteer",
  };
  const validationResult = changeSignupInputSchema.safeParse(rawSignupInput);
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, [
      "event_id",
      "officer_id",
      "remove",
      "participation_type",
    ]);
  const validatedSignupInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: validatedSignupInput.event_id,
    p_officer_id: validatedSignupInput.officer_id,
    p_remove: validatedSignupInput.remove,
    p_participation_type: validatedSignupInput.participation_type,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      ["event_id", "officer_id", "remove", "participation_type"],
      undefined,
    );
  revalidateEventPaths(validatedSignupInput.event_id);
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
  const actor = await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
  const writablePeriod = formData.get("writable_period");
  const signup = new FormData();
  signup.set("event_id", String(formData.get("event_id") ?? ""));
  signup.set("officer_id", String(actor.id));
  signup.set(
    "participation_type",
    String(formData.get("participation_type") ?? "volunteer"),
  );
  if (typeof writablePeriod === "string")
    signup.set("writable_period", writablePeriod);
  const result = await changeSignup(previous, signup);
  return result;
}

export async function bulkAddEventOfficers(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
  const rawBulkAddEventOfficersInput = {
    event_id: formData.get("event_id") ?? "",
    officer_ids: formData.getAll("officer_ids"),
    participation_type: formData.get("participation_type") ?? "volunteer",
  };
  const validationResult = bulkAddEventOfficersInputSchema.safeParse(
    rawBulkAddEventOfficersInput,
  );
  if (!validationResult.success)
    return validationFailure(
      validationResult.error,
      formData,
      ["event_id", "officer_ids", "participation_type"],
      ["officer_ids"],
    );
  const validatedBulkAddEventOfficersInput = validationResult.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_add_event_officers", {
    p_event_id: validatedBulkAddEventOfficersInput.event_id,
    p_officer_ids: validatedBulkAddEventOfficersInput.officer_ids,
    p_participation_type: validatedBulkAddEventOfficersInput.participation_type,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      ["event_id", "officer_ids"],
      undefined,
      ["officer_ids"],
    );
  revalidateEventPaths(validatedBulkAddEventOfficersInput.event_id);
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
  await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
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
  revalidateEventPaths(restoreEventValidationResult.data.event_id);
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
  await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
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
  revalidateEventPaths(validationResult.data.event_id);
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
  await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
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
  revalidateEventPaths(validation.data.event_id);
  if (!(await syncGoogleCalendarEvents([validation.data.event_id], supabase)))
    return { error: calendarSyncWarning, success: "" };
  return { error: "", success: "Event restored" };
}

export async function retryGoogleCalendarSync(
  _previous: FormActionState,
  formData: FormData,
) {
  const periodContext = formData.get("writable_period");
  // A gap-date Event can be opened without a period. The sync snapshot still
  // checks the Event's actual date and the actor's Calendar scope in SQL.
  const actor = await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: periodContext === "none" ? "current" : periodContext,
  });
  const validation = eventRecordInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  if (!isGoogleCalendarSyncEnabled())
    return {
      error: "Google Calendar synchronization is disabled.",
      success: "",
    };

  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,status,deleted_at,event_branches(branch_id)")
    .eq("id", validation.data.event_id)
    .maybeSingle();
  if (eventError || !event) return { error: "Event not found", success: "" };
  if (
    !canRecoverEventCalendarSync(
      actor,
      event.event_branches.map((row) => row.branch_id),
      event,
    )
  )
    return { error: "Event outside branch scope", success: "" };

  const synced = await syncGoogleCalendarEvents([event.id], supabase);
  revalidateEventPaths(event.id);
  if (synced && formData.has("detail_return_to")) {
    redirect(
      withSuccessNotice(
        await resolveEventDetailPath(
          supabase,
          event.id,
          formData.get("detail_return_to"),
        ),
        "event-calendar-synced",
      ),
    );
  }
  return synced
    ? { error: "", success: "Google Calendar is up to date" }
    : {
        error: "Google Calendar sync could not be confirmed. Try again.",
        success: "",
      };
}

async function resolveEventDetailPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: number,
  returnTo: FormDataEntryValue | null,
): Promise<Route> {
  const [event, periods] = await Promise.all([
    supabase
      .from("events")
      .select("event_date")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("academic_periods").select("id,starts_on,ends_on"),
  ]);
  const href = new URL(
    withReturnTo(`/events/${eventId}`, returnTo),
    "https://cappy.invalid",
  );
  const date = event.data?.event_date;
  const availablePeriods = !periods.error ? (periods.data ?? []) : [];
  const matching =
    !event.error && date
      ? academicPeriodForDate(date, availablePeriods)
      : undefined;
  const { today } = currentDenverWeek(new Date());
  const current = academicPeriodForDate(today, availablePeriods);
  href.searchParams.delete("period");
  // The detail period comes from the committed occurrence; returnTo is just the back link.
  if (!matching) href.searchParams.set("period", "none");
  else if (matching.id !== current?.id)
    href.searchParams.set("period", String(matching.id));
  return `${href.pathname}${href.search}` as Route;
}
