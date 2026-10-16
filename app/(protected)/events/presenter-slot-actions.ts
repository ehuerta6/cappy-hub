"use server";

import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { revalidatePath } from "next/cache";
import {
  changePresenterSlotInputSchema,
  presenterSlotDetailsInputSchema,
  presenterSlotRecordInputSchema,
  reorderPresenterSlotsInputSchema,
  eventRecordInputSchema,
} from "./validation";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const outsideScope = "Event outside branch scope";
const cannotEditPresenterSlot =
  "Cannot manage another officer presenter slot for this event";
const slotDetailFields = [
  "slot_id",
  "presentation_title",
  "difficulty",
  "resource_url",
  "prep_notes",
] as const;

// The database enforces scope too; this guard keeps the action consistent with
// the controls the page shows and avoids calling an RPC that must fail.
async function eventBranchIds(supabase: SupabaseClient, eventId: number) {
  const { data, error } = await supabase
    .from("event_branches")
    .select("branch_id")
    .eq("event_id", eventId);
  if (error) throw new Error("Failed to load Event branches");
  return data.map(({ branch_id }) => branch_id);
}

async function slotEventId(supabase: SupabaseClient, slotId: number) {
  const { data, error } = await supabase
    .from("presentation_slots")
    .select("event_id")
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw new Error("Failed to load presenter slot");
  return data?.event_id;
}

async function slotDetailsRecord(supabase: SupabaseClient, slotId: number) {
  const { data, error } = await supabase
    .from("presentation_slots")
    .select("event_id, officer_id")
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw new Error("Failed to load presenter slot");
  return data;
}

export async function changePresenterSlot(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = changePresenterSlotInputSchema.safeParse({
    slot_id: formData.get("slot_id") ?? "",
    officer_id: formData.get("officer_id") ?? "",
    release: formData.get("release") ?? "",
  });
  if (!validation.success)
    return validationFailure(validation.error, formData, ["officer_id"]);
  const { slot_id, release } = validation.data;
  const officerId = validation.data.officer_id ?? actor.id;
  const supabase = await createClient();
  if (officerId !== actor.id) {
    const eventId = await slotEventId(supabase, slot_id);
    if (eventId === undefined)
      return formFailure("Presenter slot not found", formData, ["officer_id"]);
    if (!canManageEvent(actor, await eventBranchIds(supabase, eventId)))
      return formFailure(
        "Cannot manage another officer presenter slot for this event",
        formData,
        ["officer_id"],
      );
  }
  const { error } = await supabase.rpc("change_presenter_slot", {
    p_slot_id: slot_id,
    p_officer_id: officerId,
    p_release: release,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["officer_id"]);
  revalidatePath("/", "layout");
  return {
    error: "",
    success: release
      ? officerId === actor.id
        ? "You stepped down from this slot"
        : "Presenter removed"
      : officerId === actor.id
        ? "You are presenting in this slot"
        : "Presenter assigned",
  };
}

export async function addPresenterSlot(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = eventRecordInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { event_id } = validation.data;
  if (!canManageEvent(actor, await eventBranchIds(supabase, event_id)))
    return { error: outsideScope, success: "" };
  const { error } = await supabase.rpc("add_presenter_slot", {
    p_event_id: event_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Presenter slot added" };
}

export async function reorderPresenterSlots(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = reorderPresenterSlotsInputSchema.safeParse({
    event_id: formData.get("event_id") ?? "",
    slot_ids: formData.getAll("slot_ids"),
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { event_id, slot_ids } = validation.data;
  if (!canManageEvent(actor, await eventBranchIds(supabase, event_id)))
    return { error: outsideScope, success: "" };
  const { error } = await supabase.rpc("reorder_presenter_slots", {
    p_event_id: event_id,
    p_slot_ids: slot_ids,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Presenter slots reordered" };
}

export async function removePresenterSlot(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = presenterSlotRecordInputSchema.safeParse({
    slot_id: formData.get("slot_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { slot_id } = validation.data;
  const eventId = await slotEventId(supabase, slot_id);
  if (eventId === undefined)
    return { error: "Presenter slot not found", success: "" };
  if (!canManageEvent(actor, await eventBranchIds(supabase, eventId)))
    return { error: outsideScope, success: "" };
  const { error } = await supabase.rpc("remove_presenter_slot", {
    p_slot_id: slot_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Presenter slot removed" };
}

export async function updatePresenterSlotDetails(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const actor = await getAuthorizationContext();
  const validation = presenterSlotDetailsInputSchema.safeParse(
    Object.fromEntries(
      slotDetailFields.map((field) => [field, formData.get(field) ?? ""]),
    ),
  );
  if (!validation.success)
    return validationFailure(validation.error, formData, slotDetailFields);
  const details = validation.data;
  const supabase = await createClient();
  const slot = await slotDetailsRecord(supabase, details.slot_id);
  if (slot === null)
    return formFailure("Presenter slot not found", formData, slotDetailFields);
  const isPresenter = slot.officer_id === actor.id;
  const canManage = canManageEvent(
    actor,
    await eventBranchIds(supabase, slot.event_id),
  );
  if (!isPresenter && !canManage)
    return formFailure(cannotEditPresenterSlot, formData, slotDetailFields);
  const { error } = await supabase.rpc("update_presenter_slot_details", {
    p_slot_id: details.slot_id,
    p_title: details.presentation_title,
    p_url: details.resource_url,
    p_difficulty: details.difficulty,
    p_notes: details.prep_notes,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      slotDetailFields,
    );
  revalidatePath("/", "layout");
  return { error: "", success: "Presenter slot details saved" };
}
