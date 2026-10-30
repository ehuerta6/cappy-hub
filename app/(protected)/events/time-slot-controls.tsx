"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValues } from "@/lib/form-feedback";
import type { Tables } from "@/lib/database.types";
import { correctHistoricalSlotRoster } from "./time-slot-actions";

export function BulkAssignOfficersToSlotsForm({
  eventId,
  officers,
  slots,
}: {
  eventId: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  slots: Pick<Tables<"event_time_slots">, "id">[];
}) {
  const [state, action, pending] = useActionState(correctHistoricalSlotRoster, {
    ...initialFormActionState,
  });
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const selectedSlots = submittedValues(state.values, "slot_ids");

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <fieldset>
        <legend>Select historical attendees</legend>
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
        {pending ? "Saving historical roster…" : "Save historical roster"}
      </button>
    </form>
  );
}
