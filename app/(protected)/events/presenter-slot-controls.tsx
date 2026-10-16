"use client";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  addPresenterSlot,
  changePresenterSlot,
  removePresenterSlot,
  reorderPresenterSlots,
  updatePresenterSlotDetails,
} from "./presenter-slot-actions";

export const presenterDifficultySuggestions = ["Easy", "Medium", "Hard"];

export function PresenterSlotChangeForm({
  slotId,
  officerId,
  release = false,
  label,
  pendingLabel,
  accessibleLabel,
}: {
  slotId: number;
  officerId?: number;
  release?: boolean;
  label: string;
  pendingLabel: string;
  accessibleLabel: string;
}) {
  const [state, action, pending] = useActionState(changePresenterSlot, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="slot_id" value={slotId} />
      {officerId !== undefined && (
        <input type="hidden" name="officer_id" value={officerId} />
      )}
      <input type="hidden" name="release" value={String(release)} />
      <ActionFeedback state={state} />
      <button
        disabled={pending}
        aria-label={accessibleLabel}
        className={`whitespace-nowrap px-3 py-1.5 ${release ? "button-secondary" : ""}`}
      >
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

export function AssignPresenterForm({
  slotId,
  position,
  officers,
}: {
  slotId: number;
  position: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
}) {
  const [state, action, pending] = useActionState(changePresenterSlot, {
    ...initialFormActionState,
  });
  const errorId = `presenter-officer-error-${slotId}`;
  const fieldError = state.fieldErrors?.officer_id;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slot_id" value={slotId} />
      <input type="hidden" name="release" value="false" />
      <label>
        Assign presenter to slot {position}
        <select
          name="officer_id"
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? errorId : undefined}
          defaultValue={submittedValue(state.values, "officer_id")}
        >
          <option value="">Select officer</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
        <FieldError id={errorId}>{fieldError}</FieldError>
      </label>
      <ActionFeedback state={state} />
      <button disabled={pending} className="px-3 py-1.5">
        {pending ? "Assigning…" : "Assign presenter"}
      </button>
    </form>
  );
}

export function PresenterSlotDetailsForm({
  slot,
}: {
  slot: Pick<
    Tables<"presentation_slots">,
    | "id"
    | "position"
    | "presentation_title"
    | "difficulty"
    | "resource_url"
    | "prep_notes"
  >;
}) {
  const [state, action, pending] = useActionState(updatePresenterSlotDetails, {
    ...initialFormActionState,
  });
  const fieldErrors = state.fieldErrors ?? {};
  const value = (
    field: "presentation_title" | "difficulty" | "resource_url" | "prep_notes",
  ) =>
    state.values ? submittedValue(state.values, field) : (slot[field] ?? "");
  const errorId = (field: string) => `presenter-${field}-error-${slot.id}`;
  const describedBy = (field: string) =>
    fieldErrors[field] ? errorId(field) : undefined;
  const suggestionsId = `presenter-difficulty-options-${slot.id}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slot_id" value={slot.id} />
      <label>
        Topic or title
        <input
          name="presentation_title"
          maxLength={200}
          defaultValue={value("presentation_title")}
          aria-invalid={Boolean(fieldErrors.presentation_title)}
          aria-describedby={describedBy("presentation_title")}
        />
        <FieldError id={errorId("presentation_title")}>
          {fieldErrors.presentation_title}
        </FieldError>
      </label>
      <label>
        Difficulty
        <input
          name="difficulty"
          list={suggestionsId}
          maxLength={100}
          defaultValue={value("difficulty")}
          aria-invalid={Boolean(fieldErrors.difficulty)}
          aria-describedby={describedBy("difficulty")}
        />
        <datalist id={suggestionsId}>
          {presenterDifficultySuggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <FieldError id={errorId("difficulty")}>
          {fieldErrors.difficulty}
        </FieldError>
      </label>
      <label>
        Resource link
        <input
          name="resource_url"
          type="url"
          defaultValue={value("resource_url")}
          aria-invalid={Boolean(fieldErrors.resource_url)}
          aria-describedby={describedBy("resource_url")}
        />
        <FieldError id={errorId("resource_url")}>
          {fieldErrors.resource_url}
        </FieldError>
      </label>
      <label>
        Prep notes
        <textarea
          name="prep_notes"
          rows={3}
          maxLength={2000}
          defaultValue={value("prep_notes")}
          aria-invalid={Boolean(fieldErrors.prep_notes)}
          aria-describedby={describedBy("prep_notes")}
        />
        <FieldError id={errorId("prep_notes")}>
          {fieldErrors.prep_notes}
        </FieldError>
      </label>
      <ActionFeedback state={state} />
      <button disabled={pending} className="px-3 py-1.5">
        {pending ? "Saving…" : `Save slot ${slot.position} details`}
      </button>
    </form>
  );
}

export function AddPresenterSlotForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(addPresenterSlot, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary px-3 py-1.5">
        {pending ? "Adding slot…" : "Add presenter slot"}
      </button>
    </form>
  );
}

export function MovePresenterSlotForm({
  eventId,
  slotIds,
  label,
  accessibleLabel,
}: {
  eventId: number;
  slotIds: number[];
  label: string;
  accessibleLabel: string;
}) {
  const [state, action, pending] = useActionState(reorderPresenterSlots, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {slotIds.map((slotId) => (
        <input key={slotId} type="hidden" name="slot_ids" value={slotId} />
      ))}
      <ActionFeedback state={state} />
      <button
        disabled={pending}
        aria-label={accessibleLabel}
        className="button-secondary px-3 py-1.5"
      >
        {pending ? "Moving…" : label}
      </button>
    </form>
  );
}

export function RemovePresenterSlotForm({
  slotId,
  position,
}: {
  slotId: number;
  position: number;
}) {
  const [state, action, pending] = useActionState(removePresenterSlot, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="slot_id" value={slotId} />
      <ActionFeedback state={state} />
      <button
        disabled={pending}
        aria-label={`Remove empty slot ${position}`}
        className="button-secondary px-3 py-1.5"
      >
        {pending ? "Removing…" : "Remove slot"}
      </button>
    </form>
  );
}
