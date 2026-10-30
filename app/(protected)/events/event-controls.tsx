"use client";
import { ActionFeedback, FieldError } from "@/components/ui";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  bulkAddEventOfficers,
  changeSignup,
  selfSignup,
  restoreEvent,
  restoreDeletedEvent,
  deleteEvent,
} from "./actions";
import { BulkAssignOfficersToSlotsForm } from "./time-slot-controls";
export function SelfSignupForm({
  eventId,
  eventName,
  full = false,
}: {
  eventId: number;
  eventName: string;
  full?: boolean;
}) {
  const [state, action, pending] = useActionState(selfSignup, {
    ...initialFormActionState,
  });
  return (
    <form action={action} className="gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <button
        disabled={pending || full}
        aria-label={`${full ? "Sign up unavailable for" : "Sign up for"} ${eventName}`}
        className="whitespace-nowrap px-3 py-1.5"
      >
        {pending ? "Signing up…" : full ? "Event full" : "Sign up"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
export function SignupForm({
  eventId,
  officers,
  remove = false,
  officerId,
}: {
  eventId: number;
  officers?: Pick<Tables<"officers">, "id" | "name">[];
  remove?: boolean;
  officerId?: number;
}) {
  const [state, action, pending] = useActionState(changeSignup, {
    ...initialFormActionState,
  });
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="remove" value={String(remove)} />
      {remove ? (
        <input type="hidden" name="officer_id" value={officerId} />
      ) : (
        <label>
          Officer
          <select
            name="officer_id"
            required
            aria-invalid={Boolean(fieldErrors.officer_id)}
            aria-describedby={
              fieldErrors.officer_id ? "signup-officer-error" : undefined
            }
            defaultValue={submittedValue(state.values, "officer_id")}
          >
            <option value="">Select officer</option>
            {officers?.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </select>
          <FieldError id="signup-officer-error">
            {fieldErrors.officer_id}
          </FieldError>
        </label>
      )}
      <ActionFeedback state={state} />
      <button disabled={pending} className={remove ? "button-secondary" : ""}>
        {pending
          ? remove
            ? "Removing…"
            : "Adding…"
          : remove
            ? "Remove signup"
            : "Add officer"}
      </button>
    </form>
  );
}
export function BulkAddOfficersForm({
  eventId,
  officers,
  past = false,
  pointsPerOfficer,
  timeSlots,
  pointsPerHour,
}: {
  eventId: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  past?: boolean;
  pointsPerOfficer?: number;
  timeSlots?: Pick<Tables<"event_time_slots">, "id">[];
  pointsPerHour?: number | null;
}) {
  const [state, action, pending] = useActionState(bulkAddEventOfficers, {
    ...initialFormActionState,
  });
  if (timeSlots) {
    return (
      <div className="mt-4 space-y-3">
        {past && (
          <p className="text-sm text-muted">
            Each selected slot receives its own duration based award
            {pointsPerHour === null || pointsPerHour === undefined
              ? " using the Event rate saved when processing starts."
              : ` using the saved rate of ${pointsPerHour} Points/hour.`}
          </p>
        )}
        <BulkAssignOfficersToSlotsForm
          eventId={eventId}
          officers={officers}
          slots={timeSlots}
        />
      </div>
    );
  }
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <fieldset
        aria-invalid={Boolean(fieldErrors.officer_ids)}
        aria-describedby={
          fieldErrors.officer_ids ? "bulk-officers-error" : undefined
        }
      >
        <legend>{past ? "Select attendees" : "Select officers to add"}</legend>
        {officers.length ? (
          <div className="event-bulk-officer-list mt-2 grid grid-cols-2 gap-2">
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
        ) : (
          <p>No active officers are available to add.</p>
        )}
        <FieldError id="bulk-officers-error">
          {fieldErrors.officer_ids}
        </FieldError>
      </fieldset>
      {past && pointsPerOfficer !== undefined && (
        <p className="text-sm text-muted">
          Each new award: {pointsPerOfficer} points from this event’s saved
          participation rate.
        </p>
      )}
      {past && pointsPerOfficer === undefined && (
        <p className="text-sm text-muted">
          The participation rate will be saved when attendees are added.
        </p>
      )}
      <ActionFeedback state={state} />
      <button disabled={pending || officers.length === 0}>
        {pending
          ? "Adding…"
          : past
            ? "Add attendees and award points"
            : "Add selected officers"}
      </button>
    </form>
  );
}
export function RestoreDeletedEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(restoreDeletedEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Restoring…" : "Restore Event"}
      </button>
    </form>
  );
}

export function RestoreCancelledEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(restoreEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Restoring…" : "Restore cancellation"}
      </button>
    </form>
  );
}

export function DeleteEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(deleteEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title="Delete Event?"
        description="The Event will leave active lists and operations. Signups, Volunteer Time Slots, recurrence identity, and history are preserved. Event linked Points stop counting in active totals until you restore the Event."
        triggerLabel={pending ? "Deleting…" : "Delete Event"}
        confirmLabel="Delete Event"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
      />
    </form>
  );
}
