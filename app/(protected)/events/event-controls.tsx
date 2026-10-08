"use client";
import { ActionFeedback, FieldError } from "@/components/ui";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import {
  RecurrenceScope,
  recurrenceScopeLabels,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  bulkAddEventOfficers,
  changeSignup,
  selfSignup,
  cancelEvent,
  restoreEvent,
  restoreEventArchive,
  removeEvent,
  leaveEventWaitlist,
} from "./actions";
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
        disabled={pending}
        aria-label={`${full ? "Join the waitlist for" : "Sign up for"} ${eventName}`}
        className="whitespace-nowrap px-3 py-1.5"
      >
        {pending
          ? full
            ? "Joining waitlist…"
            : "Signing up…"
          : full
            ? "Join waitlist"
            : "Sign up"}
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
  full = false,
}: {
  eventId: number;
  officers?: Pick<Tables<"officers">, "id" | "name">[];
  remove?: boolean;
  officerId?: number;
  full?: boolean;
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
            : full
              ? "Joining waitlist…"
              : "Adding…"
          : remove
            ? "Remove signup"
            : full
              ? "Join waitlist"
              : "Add officer"}
      </button>
    </form>
  );
}

export function LeaveWaitlistForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(leaveEventWaitlist, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Leaving waitlist…" : "Leave waitlist"}
      </button>
    </form>
  );
}
export function BulkAddOfficersForm({
  eventId,
  officers,
  past = false,
  pointsPerOfficer,
}: {
  eventId: number;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  past?: boolean;
  pointsPerOfficer?: number;
}) {
  const [state, action, pending] = useActionState(bulkAddEventOfficers, {
    ...initialFormActionState,
  });
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
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
export function CancelForm({
  eventId,
  series,
  requestKey,
}: {
  eventId: number;
  series?: RecurrenceSeries;
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(cancelEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {series && requestKey && (
        <RecurrenceScope
          series={series}
          requestKey={requestKey}
          recordType="Event"
        />
      )}
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title="Cancel Event?"
        description={
          series
            ? "This applies cancellation to the selected recurrence scope. Existing workflow history remains governed by the current Event rules."
            : "This changes the Event’s status to cancelled. Existing Event history and eligibility rules stay in effect."
        }
        triggerLabel={pending ? "Cancelling…" : "Cancel event"}
        confirmLabel="Cancel Event"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
        context={
          series
            ? {
                label: "Scope",
                fieldName: "scope",
                values: recurrenceScopeLabels,
                defaultValue: "occurrence",
              }
            : undefined
        }
      />
    </form>
  );
}

export function RestoreArchivedEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(restoreEventArchive, {
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

export function RemoveEventForm({
  eventId,
  series,
  requestKey,
}: {
  eventId: number;
  series?: RecurrenceSeries;
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(removeEvent, {
    ...initialFormActionState,
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {series && requestKey && (
        <RecurrenceScope
          series={series}
          requestKey={requestKey}
          recordType="Event"
        />
      )}
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title="Archive Event?"
        description={
          series
            ? "This archives the Event in the selected scope. Existing workflow history is preserved."
            : "This archives the Event from routine browsing. Its signups, Points, and history are preserved."
        }
        triggerLabel={pending ? "Archiving…" : "Archive Event"}
        confirmLabel="Archive Event"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
        context={
          series
            ? {
                label: "Scope",
                fieldName: "scope",
                values: recurrenceScopeLabels,
                defaultValue: "occurrence",
              }
            : undefined
        }
      />
    </form>
  );
}
