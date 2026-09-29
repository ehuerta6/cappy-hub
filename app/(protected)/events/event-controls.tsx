"use client";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import { changeSignup, cancelEvent, removeEvent } from "./actions";
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
export function CancelForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(cancelEvent, {
    error: "",
    success: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className="button-secondary">
        Cancel event
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
