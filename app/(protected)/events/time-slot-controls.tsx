"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValues } from "@/lib/form-feedback";
import { denverParts } from "@/lib/event-time";
import type { Tables } from "@/lib/database.types";
import {
  assignBulkOfficersToTimeSlots,
  changeTimeSlotSignup,
  correctHistoricalTimeSlotAssignments,
} from "./time-slot-actions";

type SelectionMode =
  "join_selected" | "join_all" | "leave_selected" | "leave_all";

function SingleSelectionAction({
  eventId,
  slotId,
  officerId,
  mode,
  label,
  disabled = false,
  hint,
}: {
  eventId: number;
  slotId?: number;
  officerId?: number;
  mode: SelectionMode;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      {officerId !== undefined && (
        <input type="hidden" name="officer_id" value={officerId} />
      )}
      {slotId !== undefined && (
        <input type="hidden" name="slot_ids" value={slotId} />
      )}
      <input type="hidden" name="mode" value={mode} />
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <button
        disabled={pending || disabled}
        className="button-secondary px-3 py-1.5"
      >
        {pending ? "Saving…" : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function JoinSelectedTimeSlotsForm({
  eventId,
  slots,
}: {
  eventId: number;
  slots: (Pick<Tables<"event_time_slots">, "id" | "starts_at" | "ends_at"> & {
    position: number;
  })[];
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  const selected = submittedValues(state.values, "slot_ids");
  const error = state.fieldErrors?.slot_ids;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="mode" value="join_selected" />
      <fieldset
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "time-slot-selection-error" : undefined}
      >
        <legend className="text-sm font-medium">Choose Time Slots</legend>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {slots.map((slot) => {
            const start = denverParts(slot.starts_at).time;
            const end = denverParts(slot.ends_at).time;
            return (
              <label key={slot.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="slot_ids"
                  value={slot.id}
                  defaultChecked={selected.includes(String(slot.id))}
                />
                Slot {slot.position}: {start}–{end}
              </label>
            );
          })}
        </div>
        <FieldError id="time-slot-selection-error">{error}</FieldError>
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending || slots.length === 0}>
        {pending ? "Joining…" : "Join selected slots"}
      </button>
    </form>
  );
}

export function JoinAllTimeSlotsForm({
  eventId,
  disabled = false,
  hint,
}: {
  eventId: number;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <SingleSelectionAction
      eventId={eventId}
      mode="join_all"
      label="Sign up for entire Event"
      disabled={disabled}
      hint={hint}
    />
  );
}

export function LeaveTimeSlotForm({
  eventId,
  slotId,
  slotName,
}: {
  eventId: number;
  slotId: number;
  slotName: string;
}) {
  return (
    <SingleSelectionAction
      eventId={eventId}
      slotId={slotId}
      mode="leave_selected"
      label={`Leave ${slotName}`}
    />
  );
}

export function LeaveAllTimeSlotsForm({
  eventId,
  officerId,
}: {
  eventId: number;
  officerId?: number;
}) {
  return (
    <SingleSelectionAction
      eventId={eventId}
      officerId={officerId}
      mode="leave_all"
      label="Leave all Time Slots"
    />
  );
}

export function AssignOfficerToTimeSlotForm({
  eventId,
  slotId,
  officers,
}: {
  eventId: number;
  slotId: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  const selected = state.values?.officer_id?.[0] ?? "";
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="mode" value="join_selected" />
      <input type="hidden" name="slot_ids" value={slotId} />
      <label>
        Add Officer to this slot
        <select name="officer_id" required defaultValue={selected}>
          <option value="">Select Officer</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending || officers.length === 0}>
        {pending ? "Adding…" : "Add to slot"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function RemoveOfficerFromTimeSlotForm({
  eventId,
  slotId,
  officerId,
  officerName,
}: {
  eventId: number;
  slotId: number;
  officerId: number;
  officerName: string;
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <input type="hidden" name="mode" value="leave_selected" />
      <input type="hidden" name="slot_ids" value={slotId} />
      <button
        disabled={pending}
        className="text-sm underline underline-offset-4"
      >
        {pending ? "Removing…" : `Remove ${officerName}`}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function BulkAssignOfficersToSlotsForm({
  eventId,
  officers,
  slots,
}: {
  eventId: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  slots: Pick<Tables<"event_time_slots">, "id">[];
}) {
  const [state, action, pending] = useActionState(
    assignBulkOfficersToTimeSlots,
    { ...initialFormActionState },
  );
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const selectedSlots = submittedValues(state.values, "slot_ids");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <fieldset>
        <legend>Select Officers</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {officers.map((officer) => (
            <label key={officer.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="officer_ids"
                value={officer.id}
                defaultChecked={selectedOfficers.includes(String(officer.id))}
              />
              {officer.name}
            </label>
          ))}
        </div>
        <FieldError id="bulk-slot-officers-error">
          {state.fieldErrors?.officer_ids}
        </FieldError>
      </fieldset>
      <fieldset>
        <legend>Select slots for each Officer</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((slot, index) => (
            <label key={slot.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="slot_ids"
                value={slot.id}
                defaultChecked={selectedSlots.includes(String(slot.id))}
              />
              Slot {index + 1}
            </label>
          ))}
        </div>
        <FieldError id="bulk-slot-selection-error">
          {state.fieldErrors?.slot_ids}
        </FieldError>
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending || officers.length === 0 || slots.length === 0}>
        {pending ? "Adding…" : "Add Officers to selected slots"}
      </button>
    </form>
  );
}

export function CorrectHistoricalTimeSlotAssignmentsForm({
  eventId,
  officerId,
  officerName,
  slots,
  selectedSlotIds,
}: {
  eventId: number;
  officerId: number;
  officerName: string;
  slots: Pick<Tables<"event_time_slots">, "id" | "starts_at" | "ends_at">[];
  selectedSlotIds: number[];
}) {
  const [state, action, pending] = useActionState(
    correctHistoricalTimeSlotAssignments,
    { ...initialFormActionState },
  );
  const selected = state.values?.slot_ids ?? selectedSlotIds.map(String);
  const fieldError = state.fieldErrors?.slot_ids;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm underline underline-offset-4">
        Correct selected Time Slots
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="officer_id" value={officerId} />
        <fieldset
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError ? `slot-correction-${officerId}` : undefined
          }
        >
          <legend className="text-sm">
            {officerName}: select eligible slots
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {slots.map((slot, index) => (
              <label key={slot.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="slot_ids"
                  value={slot.id}
                  defaultChecked={selected.includes(String(slot.id))}
                />
                Slot {index + 1}: {denverParts(slot.starts_at).time}–
                {denverParts(slot.ends_at).time}
              </label>
            ))}
          </div>
          <FieldError id={`slot-correction-${officerId}`}>
            {fieldError}
          </FieldError>
        </fieldset>
        <ActionFeedback state={state} />
        <button disabled={pending} className="button-secondary px-3 py-1.5">
          {pending ? "Saving…" : "Save Time Slots"}
        </button>
      </form>
    </details>
  );
}
