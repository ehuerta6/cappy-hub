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
import {
  bulkAddEventOfficersInputSchema,
  changeSignupInputSchema,
  eventBranchIdsInputSchema,
  eventRecordInputSchema,
  restoreEventInputSchema,
  saveEventInputSchema,
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
  "recurrence_frequency",
  "recurrence_interval",
  "recurrence_weekdays",
  "recurrence_end_mode",
  "recurrence_count",
  "recurrence_until",
] as const;
const eventFieldErrors = eventFormFields;
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
        },
      );
      const { error } = await supabase.rpc("mutate_recurring_event", args);
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
    const { data, error } = await supabase.rpc("create_recurring_event", {
      p_name: validatedEventInput.name,
      p_description: validatedEventInput.description,
      p_event_type_id: validatedEventInput.event_type_id,
      p_location: validatedEventInput.location,
      p_branch_ids: validatedEventInput.branches,
      p_slides_url: validatedEventInput.slides_url,
      p_meeting_notes_url: validatedEventInput.meeting_notes_url,
      p_signup_sheet_url: validatedEventInput.signup_sheet_url,
      p_request_key: validatedEventInput.recurrence_request_key,
      p_recurrence_rule: canonicalRecurrenceRule(recurrence),
      p_event_dates: dates,
      p_starts_at: starts as string[],
      p_ends_at: ends as string[],
    });
    if (error)
      return formFailure(
        mutationError(error.message),
        formData,
        eventFormFields,
        undefined,
        ["branches", "recurrence_weekdays"],
      );
    revalidatePath("/", "layout");
    redirect(
      withSuccessNotice(
        withReturnTo(`/events/${data}`, formData.get("returnTo")),
        "event-saved",
      ),
    );
  }
  const { data, error } = await supabase.rpc("save_event_with_signup_sheet", {
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
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      eventFormFields,
      undefined,
      ["branches", "recurrence_weekdays"],
    );
  revalidatePath("/", "layout");
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
    success: validatedSignupInput.remove ? "Signup removed" : "Officer added",
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
  return result.error ? result : { ...result, success: "Signed up for event" };
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
export async function cancelEvent(
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
  const { error } = await supabase.rpc("restore_event", {
    p_event_id: restoreEventValidationResult.data.event_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Event restored" };
}

export async function removeEvent(
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
