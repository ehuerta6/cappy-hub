"use server";

import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
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
import { redirect } from "next/navigation";
import {
  bulkAddEventOfficersInputSchema,
  changeSignupInputSchema,
  eventBranchIdsInputSchema,
  eventRecordInputSchema,
  restoreEventInputSchema,
  saveEventInputSchema,
} from "./validation";
export async function saveEvent(
  _previous: { error: string },
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
    return { error: "Event outside branch scope" };

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
    return { error: validationResult.error.issues[0].message };
  const validatedEventInput = validationResult.data;

  const start = denverTimestamp(
    validatedEventInput.event_date,
    validatedEventInput.start_time,
  );
  const end = denverTimestamp(
    validatedEventInput.event_date,
    validatedEventInput.end_time,
  );
  if (!start || !end) return { error: "Enter valid El Paso times" };
  const supabase = await createClient();
  if (validatedEventInput.id && formData.has("recurrence_series_id")) {
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
        },
      );
      const { error } = await supabase.rpc("mutate_recurring_event", args);
      if (error) return { error: mutationError(error.message) };
    } catch (error) {
      return { error: recurrenceMutationError(error) };
    }
    revalidatePath("/", "layout");
    redirect(`/events/${validatedEventInput.id}`);
    return { error: "" };
  }
  const recurrence = recurrenceInput(validatedEventInput);
  if (recurrence && validatedEventInput.id)
    return { error: "Recurrence can only be set when creating a new event" };
  if (recurrence) {
    let dates: string[];
    try {
      dates = expandRecurrenceDates(validatedEventInput.event_date, recurrence);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid recurrence",
      };
    }
    const starts = dates.map((date) =>
      denverTimestamp(date, validatedEventInput.start_time),
    );
    const ends = dates.map((date) =>
      denverTimestamp(date, validatedEventInput.end_time),
    );
    if (starts.some((value) => !value) || ends.some((value) => !value))
      return {
        error: "A recurring occurrence falls on an invalid El Paso time",
      };
    const { data, error } = await supabase.rpc("create_recurring_event", {
      p_name: validatedEventInput.name,
      p_description: validatedEventInput.description,
      p_event_type_id: validatedEventInput.event_type_id,
      p_location: validatedEventInput.location,
      p_branch_ids: validatedEventInput.branches,
      p_slides_url: validatedEventInput.slides_url,
      p_meeting_notes_url: validatedEventInput.meeting_notes_url,
      p_request_key: validatedEventInput.recurrence_request_key,
      p_recurrence_rule: canonicalRecurrenceRule(recurrence),
      p_event_dates: dates,
      p_starts_at: starts as string[],
      p_ends_at: ends as string[],
    });
    if (error) return { error: mutationError(error.message) };
    revalidatePath("/", "layout");
    redirect(`/events/${data}`);
  }
  const { data, error } = await supabase.rpc("save_event_with_links", {
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
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/events/${data}`);
}
export async function changeSignup(
  _previous: { error: string; success: string },
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
    return {
      error: validationResult.error.issues[0].message,
      success: "",
    };
  const validatedSignupInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: validatedSignupInput.event_id,
    p_officer_id: validatedSignupInput.officer_id,
    p_remove: validatedSignupInput.remove,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: validatedSignupInput.remove ? "Signup removed" : "Officer added",
  };
}
export async function selfSignup(
  previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  const signup = new FormData();
  signup.set("event_id", String(formData.get("event_id") ?? ""));
  signup.set("officer_id", String(actor.id));
  return changeSignup(previous, signup);
}
export async function bulkAddEventOfficers(
  _previous: { error: string; success: string },
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
    return {
      error: validationResult.error.issues[0].message,
      success: "",
    };
  const validatedBulkAddEventOfficersInput = validationResult.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_add_event_officers", {
    p_event_id: validatedBulkAddEventOfficersInput.event_id,
    p_officer_ids: validatedBulkAddEventOfficersInput.officer_ids,
  });
  if (error) return { error: mutationError(error.message), success: "" };
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
export async function cancelEvent(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const validationResult = eventRecordInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const supabase = await createClient();
  let response;
  try {
    response = formData.has("recurrence_series_id")
      ? await supabase.rpc(
          "mutate_recurring_event",
          await recurrenceMutation(
            "event",
            validationResult.data.event_id,
            formData,
            "cancel",
          ),
        )
      : await supabase.rpc("cancel_event", {
          p_event_id: validationResult.data.event_id,
        });
  } catch (error) {
    return { error: recurrenceMutationError(error), success: "" };
  }
  const { error } = response;
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Event cancelled" };
}

export async function restoreEvent(
  _previous: { error: string; success: string },
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
  const { error } = await supabase.rpc("restore_event", {
    p_event_id: restoreEventValidationResult.data.event_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Event restored" };
}

export async function removeEvent(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const validationResult = eventRecordInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const supabase = await createClient();
  let response;
  try {
    response = formData.has("recurrence_series_id")
      ? await supabase.rpc(
          "mutate_recurring_event",
          await recurrenceMutation(
            "event",
            validationResult.data.event_id,
            formData,
            "remove",
          ),
        )
      : await supabase.rpc("remove_event", {
          p_event_id: validationResult.data.event_id,
        });
  } catch (error) {
    return { error: recurrenceMutationError(error), success: "" };
  }
  const { data, error } = response;
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data ? "Event removed" : "Event was already removed",
  };
}
