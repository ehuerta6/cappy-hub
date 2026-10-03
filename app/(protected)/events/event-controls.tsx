"use client";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  bulkAddEventOfficers,
  changeSignup,
  selfSignup,
  cancelEvent,
  restoreEvent,
  removeEvent,
} from "./actions";
export function SelfSignupForm({
  eventId,
  eventName,
}: {
  eventId: number;
  eventName: string;
}) {
  const [state, action, pending] = useActionState(selfSignup, {
    error: "",
    success: "",
  });
  return (
    <form action={action} className="gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <button
        disabled={pending}
        aria-label={`Sign up for ${eventName}`}
        className="whitespace-nowrap px-3 py-1.5"
      >
        {pending ? "Signing up…" : "Sign up"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
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
    error: "",
    success: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="remove" value={String(remove)} />
      {remove ? (
        <input type="hidden" name="officer_id" value={officerId} />
      ) : (
        <label>
          Officer
          <select name="officer_id" required defaultValue="">
            <option value="">Select officer</option>
            {officers?.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className={remove ? "button-secondary" : ""}>
        {remove ? "Remove signup" : "Add officer"}
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
    error: "",
    success: "",
  });
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <fieldset>
        <legend>{past ? "Select attendees" : "Select officers to add"}</legend>
        {officers.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {officers.map((officer) => (
              <label key={officer.id} className="flex items-center gap-2">
                <input type="checkbox" name="officer_ids" value={officer.id} />
                {officer.name}
              </label>
            ))}
          </div>
        ) : (
          <p>No active officers are available to add.</p>
        )}
      </fieldset>
      {past && pointsPerOfficer !== undefined && (
        <p className="text-sm text-zinc-400">
          Each new award: {pointsPerOfficer} points from this event’s saved
          participation rate.
        </p>
      )}
      {past && pointsPerOfficer === undefined && (
        <p className="text-sm text-zinc-400">
          The participation rate will be saved when attendees are added.
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
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
export function CancelForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(cancelEvent, {
    error: "",
    success: "",
  });
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Cancel this event? Signups will close and no automatic points will be awarded.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className="button-secondary">
        Cancel event
      </button>
    </form>
  );
}

export function RestoreEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(restoreEvent, {
    error: "",
    success: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className="button-secondary">
        {pending ? "Restoring…" : "Restore event"}
      </button>
    </form>
  );
}

export function RemoveEventForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(removeEvent, {
    error: "",
    success: "",
  });
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Remove this event? Its signups, points and audit history will remain.",
          )
        )
          event.preventDefault();
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className="button-secondary">
        {pending ? "Removing…" : "Remove event"}
      </button>
    </form>
  );
}
