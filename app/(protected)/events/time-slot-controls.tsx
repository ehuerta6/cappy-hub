"use client";

import { useActionState, useState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { initialFormActionState, submittedValues } from "@/lib/form-feedback";
import { denverParts } from "@/lib/event-time";
import type { Tables } from "@/lib/database.types";
import { overlappingSlotPairs, slotIsFull } from "@/lib/time-slot-conflicts";
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
      <AcademicPeriodWriteContextField />
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
  currentSelections = [],
}: {
  eventId: number;
  slots: (Pick<Tables<"event_time_slots">, "id" | "starts_at" | "ends_at"> & {
    position: number;
  })[];
  currentSelections?: (Pick<
    Tables<"event_time_slots">,
    "id" | "starts_at" | "ends_at"
  > & { position: number })[];
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  const selected = submittedValues(state.values, "slot_ids");
  const [interactiveSelection, setInteractiveSelection] = useState<
    string[] | null
  >(null);
  const selectedIds = interactiveSelection ?? selected;
  const selectedSlots = slots.filter((slot) =>
    selectedIds.includes(String(slot.id)),
  );
  const conflicts = overlappingSlotPairs([
    ...currentSelections,
    ...selectedSlots,
  ]).filter(
    ([first, second]) =>
      selectedIds.includes(String(first.id)) ||
      selectedIds.includes(String(second.id)),
  );
  const selectedConflictText = conflicts
    .map(([first, second]) => `Slots ${first.position} and ${second.position}`)
    .join("; ");
  const conflictPairs = overlappingSlotPairs([...currentSelections, ...slots]);
  const conflictIds = new Set(
    conflictPairs.flatMap(([first, second]) => [first.id, second.id]),
  );
  const error = state.fieldErrors?.slot_ids;
  return (
    <form action={action} className="space-y-2">
      <AcademicPeriodWriteContextField />
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
                  checked={selectedIds.includes(String(slot.id))}
                  aria-describedby={
                    conflictIds.has(slot.id)
                      ? `slot-conflict-${slot.id}`
                      : undefined
                  }
                  onChange={(event) =>
                    setInteractiveSelection(
                      event.currentTarget.checked
                        ? [...selectedIds, String(slot.id)]
                        : selectedIds.filter((id) => id !== String(slot.id)),
                    )
                  }
                />
                <span>
                  Slot {slot.position}: {start}–{end}{" "}
                  <span className="text-muted">
                    (Open
                    {conflictIds.has(slot.id)
                      ? "; overlaps another choice"
                      : ""}
                    )
                  </span>
                  {conflictIds.has(slot.id) && (
                    <span id={`slot-conflict-${slot.id}`} className="sr-only">
                      This slot overlaps a selected or available slot. One
                      Officer cannot select both.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        <FieldError id="time-slot-selection-error">{error}</FieldError>
      </fieldset>
      {currentSelections.length > 0 && (
        <p className="text-sm text-muted">
          Already signed up:{" "}
          {currentSelections
            .map(({ position }) => `Slot ${position}`)
            .join(", ")}
          . Those choices are saved; use the leave controls to change them.
        </p>
      )}
      {selectedConflictText && (
        <p role="alert" className="text-sm font-medium">
          {selectedConflictText} overlap. One Officer cannot select both. Remove
          one selection to continue.
        </p>
      )}
      <ActionFeedback state={state} />
      <button disabled={pending || slots.length === 0 || conflicts.length > 0}>
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
  slot,
  officers,
  existingAssignments,
}: {
  eventId: number;
  slot: Pick<Tables<"event_time_slots">, "id" | "starts_at" | "ends_at">;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  existingAssignments: {
    officerId: number;
    slot: Pick<Tables<"event_time_slots">, "id" | "starts_at" | "ends_at"> & {
      position: number;
    };
  }[];
}) {
  const [state, action, pending] = useActionState(changeTimeSlotSignup, {
    ...initialFormActionState,
  });
  const selected = state.values?.officer_id?.[0] ?? "";
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="mode" value="join_selected" />
      <input type="hidden" name="slot_ids" value={slot.id} />
      <label>
        Add Officer to this slot
        <select name="officer_id" required defaultValue={selected}>
          <option value="">Select Officer</option>
          {officers.map((officer) => {
            const conflicts = existingAssignments.filter(
              ({ officerId, slot: assignedSlot }) =>
                officerId === officer.id &&
                overlappingSlotPairs([
                  { ...assignedSlot, position: assignedSlot.position },
                  { ...slot, position: 0 },
                ]).length > 0,
            );
            return (
              <option
                key={officer.id}
                value={officer.id}
                disabled={conflicts.length > 0}
              >
                {officer.name}
                {conflicts.length > 0
                  ? ` — conflicts with Slot ${conflicts[0].slot.position}`
                  : ""}
              </option>
            );
          })}
        </select>
      </label>
      {officers.length === 0 && (
        <p className="text-sm text-muted">
          No eligible Officer is available for this slot.
        </p>
      )}
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
      <AcademicPeriodWriteContextField />
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
  slots: (Pick<
    Tables<"event_time_slots">,
    "id" | "starts_at" | "ends_at" | "capacity"
  > & { registeredCount: number })[];
}) {
  const [state, action, pending] = useActionState(
    assignBulkOfficersToTimeSlots,
    { ...initialFormActionState },
  );
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const selectedSlots = submittedValues(state.values, "slot_ids");
  const [interactiveSelection, setInteractiveSelection] = useState<
    string[] | null
  >(null);
  const selectedIds = interactiveSelection ?? selectedSlots;
  const byId = new Map(
    slots.map((slot, index) => [slot.id, { ...slot, position: index + 1 }]),
  );
  const selectedSlotRecords = selectedIds.flatMap((id) => {
    const slot = byId.get(Number(id));
    return slot ? [slot] : [];
  });
  const conflicts = overlappingSlotPairs(selectedSlotRecords);
  const selectedFullSlots = selectedSlotRecords.filter((slot) =>
    slotIsFull(slot.capacity, slot.registeredCount),
  );
  return (
    <form action={action} className="space-y-3">
      <AcademicPeriodWriteContextField />
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
                checked={selectedIds.includes(String(slot.id))}
                disabled={
                  slotIsFull(slot.capacity, slot.registeredCount) &&
                  !selectedIds.includes(String(slot.id))
                }
                onChange={(event) =>
                  setInteractiveSelection(
                    event.currentTarget.checked
                      ? [...selectedIds, String(slot.id)]
                      : selectedIds.filter((id) => id !== String(slot.id)),
                  )
                }
              />
              <span>
                Slot {index + 1}: {denverParts(slot.starts_at).time}–
                {denverParts(slot.ends_at).time}{" "}
                <span className="text-muted">
                  (
                  {slotIsFull(slot.capacity, slot.registeredCount)
                    ? selectedIds.includes(String(slot.id))
                      ? "Full — unavailable; selected for assignment"
                      : "Full — unavailable"
                    : selectedIds.includes(String(slot.id))
                      ? "Selected for assignment"
                      : "Open — available"}
                  )
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="bulk-slot-selection-error">
          {state.fieldErrors?.slot_ids}
        </FieldError>
      </fieldset>
      {selectedFullSlots.length > 0 && (
        <p role="alert" className="text-sm font-medium">
          {selectedFullSlots
            .map(({ position }) => `Slot ${position}`)
            .join(", ")}{" "}
          are full. Remove them before assigning Officers.
        </p>
      )}
      {conflicts.length > 0 && (
        <p role="alert" className="text-sm font-medium">
          {conflicts
            .map(
              ([first, second]) =>
                `Slots ${first.position} and ${second.position}`,
            )
            .join("; ")}{" "}
          overlap. Each selected Officer would receive every selected slot, so
          remove one from each overlapping pair.
        </p>
      )}
      <ActionFeedback state={state} />
      <button
        disabled={
          pending ||
          officers.length === 0 ||
          slots.length === 0 ||
          conflicts.length > 0 ||
          selectedFullSlots.length > 0
        }
      >
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
        <AcademicPeriodWriteContextField />
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
