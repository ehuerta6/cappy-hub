"use client";
import { ActionFeedback, FieldError } from "@/components/ui";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
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
  retryGoogleCalendarSync,
} from "./actions";
import { BulkAssignOfficersToSlotsForm } from "./time-slot-controls";

export function RetryGoogleCalendarSyncForm({
  eventId,
  compact = false,
}: {
  eventId: number;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(retryGoogleCalendarSync, {
    ...initialFormActionState,
  });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      <button
        disabled={pending}
        aria-label={
          compact ? `Retry Calendar sync for Event ${eventId}` : undefined
        }
        className="button-secondary"
      >
        {pending ? "Retrying…" : "Retry Calendar sync"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function SelfSignupForm({
  eventId,
  eventName,
  full = false,
  currentType,
  compact = false,
}: {
  eventId: number;
  eventName: string;
  full?: boolean;
  currentType?: "volunteer" | "attendee";
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(selfSignup, {
    ...initialFormActionState,
  });
  return (
    <form
      action={action}
      className={compact ? "compact-signup-form" : "space-y-2"}
    >
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      <div
        role="group"
        aria-label={`Choose signup type for ${eventName}`}
        className={
          compact
            ? "inline-flex w-fit flex-nowrap gap-1"
            : "flex flex-wrap gap-2"
        }
      >
        <SignupTypeButtons
          eventName={eventName}
          currentType={currentType}
          pending={pending}
          full={full}
          compact={compact}
        />
      </div>
      {(!compact || state.error) && <ActionFeedback state={state} />}
    </form>
  );
}

function SignupTypeButtons({
  eventName,
  currentType,
  pending,
  full,
  compact = false,
}: {
  eventName: string;
  currentType?: "volunteer" | "attendee";
  pending: boolean;
  full: boolean;
  compact?: boolean;
}) {
  return (
    <>
      <button
        type="submit"
        name="participation_type"
        value="volunteer"
        disabled={pending || full || currentType === "volunteer"}
        aria-pressed={currentType === "volunteer"}
        aria-label={`${currentType === "volunteer" ? "Signed up as Volunteer for" : "Sign Up as Volunteer for"} ${eventName} (2 Points per hour)`}
        className={
          compact
            ? `compact-action-button ${currentType === "volunteer" ? "compact-action-button--primary" : "compact-action-button--option"}`
            : `${currentType === "volunteer" ? "button-primary" : "button-secondary"} min-h-11 whitespace-nowrap px-3 py-1.5`
        }
      >
        {pending
          ? "Saving…"
          : currentType === "volunteer"
            ? "Signed up"
            : "Sign Up"}
      </button>
      <button
        type="submit"
        name="participation_type"
        value="attendee"
        disabled={pending || full || currentType === "attendee"}
        aria-pressed={currentType === "attendee"}
        aria-label={`${currentType === "attendee" ? "Attending as an Attendee at" : "Attend as an Attendee at"} ${eventName} (1 Point per hour)`}
        className={
          compact
            ? `compact-action-button ${currentType === "attendee" ? "compact-action-button--primary" : "compact-action-button--option"}`
            : `${currentType === "attendee" ? "button-primary" : "button-secondary"} min-h-11 whitespace-nowrap px-3 py-1.5`
        }
      >
        {pending
          ? "Saving…"
          : currentType === "attendee"
            ? "Attending"
            : "Attend"}
      </button>
    </>
  );
}
export function SignupForm({
  eventId,
  officers,
  remove = false,
  officerId,
  compact = false,
}: {
  eventId: number;
  officers?: Pick<Tables<"officers">, "id" | "name">[];
  remove?: boolean;
  officerId?: number;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(changeSignup, {
    ...initialFormActionState,
  });
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form
      action={action}
      className={compact ? "compact-signup-form" : undefined}
    >
      <AcademicPeriodWriteContextField />
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
      {!remove && (
        <label>
          Signup type
          <select
            name="participation_type"
            defaultValue="volunteer"
            disabled={pending}
          >
            <option value="volunteer">Volunteer</option>
            <option value="attendee">Attend</option>
          </select>
        </label>
      )}
      {(!compact || state.error) && <ActionFeedback state={state} />}
      <button
        disabled={pending}
        className={
          compact
            ? `compact-action-button ${remove ? "compact-action-button--remove" : ""}`
            : remove
              ? "button-secondary"
              : ""
        }
      >
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
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      <label>
        Signup type
        <select
          name="participation_type"
          defaultValue="volunteer"
          disabled={pending}
        >
          <option value="volunteer">Volunteer</option>
          <option value="attendee">Attend</option>
        </select>
      </label>
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
const lifecycleScopeContext = {
  label: "Scope",
  fieldName: "scope",
  values: {
    occurrence: "This occurrence only. Other deleted occurrences stay deleted.",
    following:
      "This occurrence and following occurrences from the same Delete action only.",
    series: "All occurrences from the same Delete action only.",
  },
  defaultValue: "occurrence",
} as const;

function RecurrenceLifecycleScope() {
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">Choose occurrences</legend>
      {[
        ["occurrence", "This occurrence"],
        ["following", "This and following occurrences"],
        ["series", "All occurrences"],
      ].map(([value, label]) => (
        <label key={value} className="flex items-center gap-2">
          <input
            type="radio"
            name="scope"
            value={value}
            defaultChecked={value === "occurrence"}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function lifecycleInputs({
  seriesId,
  revision,
  requestKey,
}: {
  seriesId?: number;
  revision?: number;
  requestKey?: string;
}) {
  if (seriesId === undefined || revision === undefined) return null;
  return (
    <>
      <input type="hidden" name="recurrence_series_id" value={seriesId} />
      <input type="hidden" name="recurrence_revision" value={revision} />
      <input type="hidden" name="mutation_request_key" value={requestKey} />
    </>
  );
}

export function RestoreDeletedEventForm({
  eventId,
  seriesId,
  revision,
  requestKey,
}: {
  eventId: number;
  seriesId?: number;
  revision?: number;
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(restoreDeletedEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      {lifecycleInputs({ seriesId, revision, requestKey })}
      <ActionFeedback state={state} />
      {seriesId !== undefined ? (
        <ConfirmationDialog
          title="Restore recurring Event?"
          description="Only occurrences deleted by the same Delete action are eligible. Independently deleted occurrences remain deleted, and signups, Volunteer Time Slots, Points, and occurrence history are preserved."
          triggerLabel={pending ? "Restoring…" : "Restore Event"}
          confirmLabel="Restore selected scope"
          context={lifecycleScopeContext}
          pending={pending}
        >
          <RecurrenceLifecycleScope />
        </ConfirmationDialog>
      ) : (
        <button disabled={pending} className="button-secondary">
          {pending ? "Restoring…" : "Restore Event"}
        </button>
      )}
    </form>
  );
}

export function RestoreCancelledEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(restoreEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Restoring…" : "Restore cancellation"}
      </button>
    </form>
  );
}

export function DeleteEventForm({
  eventId,
  seriesId,
  revision,
  requestKey,
}: {
  eventId: number;
  seriesId?: number;
  revision?: number;
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(deleteEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="event_id" value={eventId} />
      {lifecycleInputs({ seriesId, revision, requestKey })}
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title={
          seriesId === undefined ? "Delete Event?" : "Delete recurring Events?"
        }
        description="The selected scope leaves active lists and operations. Signups, Volunteer Time Slots, recurrence identity, and history are preserved. Event linked Points stop counting in active totals until eligible occurrences are restored."
        triggerLabel={pending ? "Deleting…" : "Delete Event"}
        confirmLabel="Delete Event"
        destructive
        context={seriesId !== undefined ? lifecycleScopeContext : undefined}
        pending={pending}
        triggerClassName="button-secondary"
      >
        {seriesId !== undefined && <RecurrenceLifecycleScope />}
      </ConfirmationDialog>
    </form>
  );
}
