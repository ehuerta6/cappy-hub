"use client";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import { changeSignup, cancelEvent } from "./actions";
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
  const [state, action, pending] = useActionState(changeSignup, { error: "" });
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
      <button disabled={pending}>
        {remove ? "Remove signup" : "Add officer"}
      </button>
    </form>
  );
}
export function CancelForm({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState(cancelEvent, { error: "" });
  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>Cancel event</button>
    </form>
  );
}
