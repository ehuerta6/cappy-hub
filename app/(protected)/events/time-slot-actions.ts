"use server";

import { canManageEvent, getAuthorizationContext } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import * as zod from "zod";

const slotSelectionInputSchema = zod.object({
  event_id: zod
    .string()
    .regex(/^-?[1-9]\d*$/)
    .transform(Number),
  officer_id: zod
    .string()
    .regex(/^-?[1-9]\d*$/)
    .transform(Number)
    .optional(),
  mode: zod.enum(["join_selected", "join_all", "leave_selected", "leave_all"]),
  slot_ids: zod
    .array(
      zod
        .string()
        .regex(/^-?[1-9]\d*$/)
        .transform(Number),
    )
    .max(24)
    .default([]),
});

export async function changeTimeSlotSignup(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = slotSelectionInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
    officer_id: formData.get("officer_id") ?? undefined,
    mode: formData.get("mode") ?? "",
    slot_ids: formData.getAll("slot_ids"),
  });
  if (!validation.success)
    return validationFailure(validation.error, formData, ["slot_ids"]);

  const { event_id, officer_id, mode, slot_ids } = validation.data;
  const supabase = await createClient();
  if (officer_id !== undefined && officer_id !== actor.id) {
    const { data: branches, error: branchError } = await supabase
      .from("event_branches")
      .select("branch_id")
      .eq("event_id", event_id);
    if (branchError)
      return formFailure("Failed to verify Event permissions", formData);
    if (
      !canManageEvent(
        actor,
        (branches ?? []).map(({ branch_id }) => branch_id),
      )
    )
      return formFailure("Event outside branch scope", formData);
  }

  const { error } = await supabase.rpc("change_event_time_slot_signup", {
    p_event_id: event_id,
    p_officer_id: officer_id ?? actor.id,
    p_slot_ids: slot_ids,
    p_mode: mode,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["slot_ids"]);
  revalidatePath("/", "layout");
  const success = {
    join_selected: "Time Slot signup saved",
    join_all: "You signed up for every Time Slot",
    leave_selected: "Time Slot signup removed",
    leave_all: "You left every Time Slot",
  }[mode];
  return { error: "", success };
}

export async function assignBulkOfficersToTimeSlots(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = zod
    .object({
      event_id: zod
        .string()
        .regex(/^-?[1-9]\d*$/)
        .transform(Number),
      officer_ids: zod
        .array(
          zod
            .string()
            .regex(/^-?[1-9]\d*$/)
            .transform(Number),
        )
        .min(1),
      slot_ids: zod
        .array(
          zod
            .string()
            .regex(/^-?[1-9]\d*$/)
            .transform(Number),
        )
        .min(1)
        .max(24),
    })
    .safeParse({
      event_id: formData.get("event_id") ?? "",
      officer_ids: formData.getAll("officer_ids"),
      slot_ids: formData.getAll("slot_ids"),
    });
  if (!validation.success)
    return validationFailure(
      validation.error,
      formData,
      ["officer_ids", "slot_ids"],
      ["officer_ids", "slot_ids"],
    );
  const { event_id, officer_ids, slot_ids } = validation.data;
  const supabase = await createClient();
  const { data: branches, error: branchError } = await supabase
    .from("event_branches")
    .select("branch_id")
    .eq("event_id", event_id);
  if (branchError)
    return formFailure("Failed to verify Event permissions", formData);
  if (
    !canManageEvent(
      actor,
      (branches ?? []).map(({ branch_id }) => branch_id),
    )
  )
    return formFailure("Event outside branch scope", formData);

  const { data, error } = await supabase.rpc(
    "bulk_add_event_officers_to_slots",
    { p_event_id: event_id, p_officer_ids: officer_ids, p_slot_ids: slot_ids },
  );
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      ["officer_ids", "slot_ids"],
      undefined,
      ["officer_ids", "slot_ids"],
    );
  revalidatePath("/", "layout");
  const result = data as {
    added_officer_ids?: number[];
    award_transaction_ids?: number[];
  };
  const count = result.added_officer_ids?.length ?? 0;
  const awards = result.award_transaction_ids?.length ?? 0;
  return {
    error: "",
    success:
      awards > 0
        ? `Added ${count} attendee${count === 1 ? "" : "s"} and created ${awards} separate slot award${awards === 1 ? "" : "s"}`
        : `Added ${count} officer${count === 1 ? "" : "s"} to the selected slots`,
  };
}

export async function correctHistoricalTimeSlotAssignments(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = zod
    .object({
      event_id: zod
        .string()
        .regex(/^-?[1-9]\d*$/)
        .transform(Number),
      officer_id: zod
        .string()
        .regex(/^-?[1-9]\d*$/)
        .transform(Number),
      slot_ids: zod
        .array(
          zod
            .string()
            .regex(/^-?[1-9]\d*$/)
            .transform(Number),
        )
        .max(24),
    })
    .safeParse({
      event_id: formData.get("event_id") ?? "",
      officer_id: formData.get("officer_id") ?? "",
      slot_ids: formData.getAll("slot_ids"),
    });
  if (!validation.success)
    return validationFailure(validation.error, formData, ["slot_ids"]);

  const { event_id, officer_id, slot_ids } = validation.data;
  const supabase = await createClient();
  const { data: branches, error: branchError } = await supabase
    .from("event_branches")
    .select("branch_id")
    .eq("event_id", event_id);
  if (branchError)
    return formFailure("Failed to verify Event permissions", formData);
  if (
    !canManageEvent(
      actor,
      (branches ?? []).map(({ branch_id }) => branch_id),
    )
  )
    return formFailure("Event outside branch scope", formData);

  const { error } = await supabase.rpc("correct_historical_event_time_slots", {
    p_event_id: event_id,
    p_officer_id: officer_id,
    p_slot_ids: slot_ids,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["slot_ids"]);
  revalidatePath("/", "layout");
  return { error: "", success: "Historical Time Slot assignments saved" };
}
